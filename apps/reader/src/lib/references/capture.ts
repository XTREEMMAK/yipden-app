import {
	FeedHttp,
	HttpError,
	headerNoIndex,
	isOnOwnSite,
	linkedOnPage,
	metaNoIndex,
	textOnPage,
	type TextResponse
} from '@yipden/feeds';
import { previewKindOf } from '@yipden/ring-client';
import { httpFetch } from '../platform/http.js';
import { store as defaultStore } from '../store/index.js';
import type { ReferenceCheck, Store } from '../store/types.js';
import { verdictKey } from '../verdicts.svelte.js';
import type { Reference, ReferenceKind, TextSelector } from './types.js';

/**
 * The capture rules (the reference finds brief), applied when something is kept and again on
 * every re-check:
 *
 * 1. Their own site, or linked from it. A file on one of the creator's own sites (after
 *    redirects) is host-verified. One on another host is kept too when it was found on one of
 *    their own pages: creators often keep files on a second host (File Garden and the like), and
 *    their own page linking it is the evidence. It is not host-verified and never sharable, and
 *    the reader can remove it. A pasted link to another host has no such evidence and is refused.
 *    A known platform's player found on their page is kept as a link that opens on the platform:
 *    never host-verified, never sharable (decided 2026-10-03).
 * 2. Only what is publicly linked. Recorded with the page it was found on; whether that page's
 *    own markup links it decides what a re-check can prove later.
 * 3. "No" signals: robots.txt disallowing the page, or `noindex` in its meta tags or
 *    `X-Robots-Tag`, keep the reference for the reader but make it not sharable.
 * 4. Re-check, never remember: gone is gone, because no copy exists.
 *
 * The network can always fail. A check that could not finish never refuses a capture or marks
 * a reference gone; it leaves what it could not prove unproven.
 */

/** Statuses that mean the thing is not there, as opposed to the network failing to say. */
const GONE_STATUSES = new Set([404, 410]);

export interface CaptureDeps {
	http: FeedHttp;
	store: Store;
	now: () => Date;
}

export function defaultDeps(): CaptureDeps {
	return { http: sharedHttp(), store: defaultStore, now: () => new Date() };
}

let http: FeedHttp | null = null;
/** One polite client for every reference check, so its per-host spacing covers all of them. */
function sharedHttp(): FeedHttp {
	http ??= new FeedHttp({ fetch: httpFetch });
	return http;
}

/** A known platform's player or page, kept as a link rather than as a file of the creator's. */
export function isPlatformLink(kind: ReferenceKind, url: string): boolean {
	const preview = previewKindOf(url);
	return kind === 'audio' && preview !== 'file' && preview !== 'external';
}

/**
 * The creator's own sites: the address they were found at, where it redirects to, and for
 * someone followed, their site and any of their own feeds proved by a two-way link. A feed on a
 * platform (Bluesky, YouTube) never counts, even verified: the platform's host is not theirs.
 */
export async function creatorSites(creatorUrl: string, deps: CaptureDeps): Promise<string[]> {
	const sites = new Set([creatorUrl]);
	try {
		sites.add((await deps.http.head(creatorUrl)).url);
	} catch {
		// Unreachable right now: the address as given still counts.
	}
	const key = verdictKey(creatorUrl);
	const person = (await deps.store.listPeople()).find((entry) => verdictKey(entry.siteUrl) === key);
	if (person) {
		sites.add(person.siteUrl);
		for (const feed of await deps.store.listFeeds(person.id)) {
			if (
				feed.verified &&
				(feed.kind === 'blog' || feed.kind === 'podcast') &&
				!onSharedHost(feed.url)
			) {
				sites.add(feed.url);
			}
		}
	}
	return [...sites];
}

/**
 * Hosts whose feeds describe someone's site without being it: Neocities' update feed lives on
 * `neocities.org` for every site there, so counting it would make all of Neocities theirs.
 */
const SHARED_FEED_HOSTS = new Set(['neocities.org']);

function onSharedHost(url: string): boolean {
	try {
		return SHARED_FEED_HOSTS.has(new URL(url).hostname.toLowerCase().replace(/^www\./, ''));
	} catch {
		return true;
	}
}

interface PageFindings {
	/** False when robots.txt disallows the page, or it says noindex. */
	allowed: boolean;
	/** The page's markup links the file, or (for text) still shows the passage. Null: unknown. */
	linked: boolean | null;
	/** The page itself answered 404 or 410. */
	gone: boolean;
}

async function readPage(
	pageUrl: string,
	target: { url: string; canonicalUrl: string; selector?: TextSelector },
	deps: CaptureDeps
): Promise<PageFindings> {
	let page: TextResponse;
	try {
		page = await deps.http.get(pageUrl, {
			accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
		});
	} catch (cause) {
		if (cause instanceof HttpError && cause.status === 999) {
			// robots.txt asks not to be fetched: honoured, so nothing about the page is known.
			return { allowed: false, linked: null, gone: false };
		}
		if (cause instanceof HttpError && GONE_STATUSES.has(cause.status)) {
			return { allowed: true, linked: false, gone: true };
		}
		return { allowed: true, linked: null, gone: false };
	}
	const allowed = !metaNoIndex(page.body) && !headerNoIndex(page.robotsTag);
	const linked = target.selector
		? textOnPage(page.body, target.selector.exact)
		: linkedOnPage(page.body, page.url, target.url) ||
			linkedOnPage(page.body, page.url, target.canonicalUrl);
	return { allowed, linked, gone: false };
}

export type CaptureRefusal = 'not-own-site' | 'missing' | 'temporary';

/** Query parameters that sign an address so it stops working: a token, or a cloud signature. */
const SIGNING_PARAMS = new Set([
	'token',
	'x-amz-signature',
	'x-goog-signature',
	'signature',
	'hdnts',
	'hdnea'
]);

/**
 * An address made to expire: a Bandcamp stream (`bcbits.com/stream/…`, re-signed on every page
 * load), or any file address carrying a signature or token. It plays for a while, but kept, it
 * would be dead within hours, so it is never kept (2026-10-06).
 */
export function isTemporaryAddress(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const host = parsed.hostname.toLowerCase();
	if (
		(host === 'bcbits.com' || host.endsWith('.bcbits.com')) &&
		parsed.pathname.startsWith('/stream/')
	) {
		return true;
	}
	for (const name of parsed.searchParams.keys()) {
		if (SIGNING_PARAMS.has(name.toLowerCase())) return true;
	}
	return false;
}

/**
 * Why Keep would refuse this, worked out before the reader taps it, so something that cannot be
 * kept never looks as if it could. The same rules as `assessCapture` up to reading the page, with
 * the creator's `sites` passed in, so a sheet of several finds looks them up once. Null: Keep can
 * be offered; it can still refuse, as when the file turns out to be gone by then.
 */
export async function precheckCapture(
	draft: { kind: ReferenceKind; url: string; foundOnPage?: string },
	sites: string[],
	deps: CaptureDeps = defaultDeps()
): Promise<CaptureRefusal | null> {
	if (isPlatformLink(draft.kind, draft.url)) return null;
	if (draft.kind !== 'text' && isTemporaryAddress(draft.url)) return 'temporary';
	if (draft.foundOnPage && isOnOwnSite(draft.foundOnPage, sites)) return null;
	if (isOnOwnSite(draft.url, sites)) return null;
	try {
		// Only a redirect onto their own site could still make it theirs.
		return isOnOwnSite((await deps.http.head(draft.url)).url, sites) ? null : 'not-own-site';
	} catch (cause) {
		if (cause instanceof HttpError && GONE_STATUSES.has(cause.status)) return 'missing';
		return 'not-own-site';
	}
}

export type CaptureResult =
	| { ok: false; reason: CaptureRefusal }
	| {
			ok: true;
			fields: Pick<Reference, 'canonicalUrl' | 'hostVerified' | 'sharable'> &
				Partial<Pick<Reference, 'etag' | 'checkedAt' | 'linkedInMarkup'>>;
	  };

/** Whether something may be kept for a creator, and what is true of it if so. */
export async function assessCapture(
	draft: {
		kind: ReferenceKind;
		url: string;
		creatorUrl: string;
		foundOnPage?: string;
		selector?: TextSelector;
	},
	deps: CaptureDeps = defaultDeps()
): Promise<CaptureResult> {
	if (isPlatformLink(draft.kind, draft.url)) {
		return { ok: true, fields: { canonicalUrl: draft.url, hostVerified: false, sharable: false } };
	}

	if (draft.kind !== 'text' && isTemporaryAddress(draft.url)) {
		return { ok: false, reason: 'temporary' };
	}

	const sites = await creatorSites(draft.creatorUrl, deps);
	let canonicalUrl = draft.url;
	let etag: string | undefined;
	let checked = false;
	// A passage's address is a page, read below; a file is asked about without downloading it.
	if (draft.kind !== 'text') {
		try {
			const head = await deps.http.head(draft.url);
			canonicalUrl = head.url;
			etag = head.etag;
			checked = true;
		} catch (cause) {
			if (cause instanceof HttpError && GONE_STATUSES.has(cause.status)) {
				return { ok: false, reason: 'missing' };
			}
			// Unreachable, or a host that refuses HEAD: judged on the address as given.
		}
	}
	const ownHost = isOnOwnSite(canonicalUrl, sites);
	// Found on one of their own pages: the page linking it is what ties it to them (2026-10-05).
	const foundOnTheirPage = !!draft.foundOnPage && isOnOwnSite(draft.foundOnPage, sites);
	if (!ownHost && !foundOnTheirPage) return { ok: false, reason: 'not-own-site' };

	const page = draft.foundOnPage
		? await readPage(
				draft.foundOnPage,
				{ url: draft.url, canonicalUrl, ...(draft.selector ? { selector: draft.selector } : {}) },
				deps
			)
		: null;
	if (draft.kind === 'text' && page) checked = !page.gone && page.linked !== null;

	return {
		ok: true,
		fields: {
			canonicalUrl,
			hostVerified: ownHost,
			sharable: ownHost && Boolean(page && page.allowed && page.linked),
			...(etag ? { etag } : {}),
			...(page && page.linked !== null ? { linkedInMarkup: page.linked } : {}),
			...(checked ? { checkedAt: deps.now().toISOString() } : {})
		}
	};
}

/**
 * Whether a re-check could learn anything at all. A platform's player is never asked about (it
 * is not the creator's file), so it can only be re-proved through a page whose markup linked it.
 */
export function canRecheck(reference: Reference): boolean {
	// A passage without its text (one restored from a backup, which carries only the link) has
	// nothing on the page to look for.
	if (reference.kind === 'text') return Boolean(reference.selector);
	if (!isPlatformLink(reference.kind, reference.url)) return true;
	return Boolean(reference.foundOnPage) && reference.linkedInMarkup === true;
}

/**
 * Check a kept reference again. Null when nothing could be learned (offline, a host refusing
 * HEAD): the reference stays as it was rather than being judged on a failed request.
 */
export async function recheck(
	reference: Reference,
	deps: CaptureDeps = defaultDeps()
): Promise<ReferenceCheck | null> {
	const checkedAt = deps.now().toISOString();
	const gone: ReferenceCheck = { status: 'gone', checkedAt, sharable: false };
	const platform = isPlatformLink(reference.kind, reference.url);

	let canonicalUrl = reference.canonicalUrl;
	let etag = reference.etag;
	let learned = false;
	if (!platform && reference.kind !== 'text') {
		try {
			const head = await deps.http.head(
				reference.canonicalUrl,
				reference.etag ? { etag: reference.etag } : {}
			);
			learned = true;
			if (!head.notModified) {
				canonicalUrl = head.url;
				etag = head.etag;
			}
		} catch (cause) {
			if (cause instanceof HttpError && GONE_STATUSES.has(cause.status)) return gone;
		}
	}

	// The page is only asked again when it can prove something: it linked the file in its markup
	// at capture, or (for text) it is where the passage lives.
	const pageUrl = reference.kind === 'text' ? reference.url : reference.foundOnPage;
	const askPage =
		pageUrl &&
		(reference.kind === 'text' ? Boolean(reference.selector) : reference.linkedInMarkup === true);
	let sharable = reference.sharable;
	if (askPage) {
		const page = await readPage(pageUrl, { ...reference, canonicalUrl }, deps);
		if (page.gone || page.linked === false) return gone;
		if (page.linked !== null) learned = true;
		sharable = reference.hostVerified && page.allowed && page.linked === true;
	}
	if (!learned) return null;

	const sites = platform ? [] : await creatorSites(`https://${reference.creatorId}`, deps);
	const hostVerified = !platform && isOnOwnSite(canonicalUrl, sites);
	return {
		status: 'live',
		checkedAt,
		canonicalUrl,
		hostVerified,
		sharable: hostVerified && sharable,
		...(etag ? { etag } : {})
	};
}
