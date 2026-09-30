import { layoutOf } from './normalize.js';
import type { SiteLayout } from './types.js';
import { normalizeUrl, safeUrl } from './url.js';

/**
 * Other webrings, read through one adapter each.
 *
 * IndieNodes' own `ring.json` is the only ring this package understands natively. A partner ring
 * publishes whatever shape its own maintainers chose, and treating arbitrary remote JSON as if
 * every ring were interchangeable is how one ring's quirk becomes every ring's bug. So each
 * partner ring gets an adapter that says how to read *that* ring, and this file is the boundary
 * every adapter's output crosses:
 *
 * - The adapter only maps a ring's own document onto loose candidates. It cannot skip checks,
 *   because it never returns a member, only something `readPartnerRing` then validates.
 * - What comes out is a deliberately small common shape (`PartnerMember`): a name, a public
 *   https address and a few optional extras.
 * - Richer fields are gated by the capabilities the adapter declares, so a ring that publishes
 *   thumbnails opts in to them, and one that does not can never leak a stray `thumbUrl`.
 *
 * Partner members are never merged into the IndieNodes rotation. That is enforced by the type,
 * not by convention: a `PartnerMember` is not a `RingEntry`, and nothing here builds one.
 */

/** Richer fields a ring may opt in to. Anything not listed is never read from a partner. */
export const PARTNER_CAPABILITIES = [
	'thumbnails',
	'tags',
	'layout',
	'sensitive',
	'preview'
] as const;
export type PartnerCapability = (typeof PARTNER_CAPABILITIES)[number];

/** Who a partner ring is, and where its own hub lives. Members link "via" this. */
export interface PartnerRingInfo {
	/** Stable, lowercase, used as a key and never shown. */
	id: string;
	name: string;
	/** The ring's own front door. Every member card links here, not to IndieNodes. */
	hubUrl: string;
}

/** What an adapter hands the boundary for one member: untrusted, and possibly incomplete. */
export interface PartnerCandidate {
	id?: unknown;
	name?: unknown;
	url?: unknown;
	blurb?: unknown;
	thumbUrl?: unknown;
	tags?: unknown;
	layout?: unknown;
	sensitive?: unknown;
	previewUrl?: unknown;
}

export interface PartnerAdapter {
	ring: PartnerRingInfo;
	/** Fields beyond the common shape this ring is trusted to supply. */
	capabilities: readonly PartnerCapability[];
	/**
	 * Map this ring's own document onto candidates. Must not throw for a document of the wrong
	 * shape: return an empty list, and the boundary reports the ring as unreadable.
	 */
	read(document: unknown): PartnerCandidate[];
}

/** The small shape every partner ring is reduced to. */
export interface PartnerMember {
	ringId: string;
	id: string;
	name: string;
	/** The member's own site: public, https, checked. */
	url: string;
	blurb?: string;
	/** Only present when the adapter declared `thumbnails`. */
	thumbUrl?: string;
	/** Only present when the adapter declared `tags`. */
	tags?: string[];
	/** Only ever present when the adapter declared `layout`; otherwise mobile friendly. */
	layout: SiteLayout;
	/**
	 * Only present when the adapter declared `sensitive`, and then always a definite boolean, not
	 * absent-means-no. Matches the IndieNodes ring's own `explicit`: hidden unless a reader opts
	 * in, the conservative direction to be wrong in for a ring this app does not vet itself.
	 */
	sensitive?: boolean;
	/**
	 * A sample the member chose to hand the ring itself, not a link this app went and found: a
	 * track, an embed page, whatever they gave the ring's own maintainer as "hear this first".
	 * Only present when the adapter declared `preview`. Always opened externally, never assumed
	 * playable in app: unlike IndieNodes' own `tracks[]`, this is neither a known format nor
	 * something a client fetched and verified, only a link a ring vouches for.
	 */
	previewUrl?: string;
}

export interface PartnerRingResult {
	ring: PartnerRingInfo;
	members: PartnerMember[];
	/** One line per refused member, or for the ring itself, so a caller can report rather than guess. */
	dropped: Array<{ index: number; reason: string }>;
}

/** A ceiling, as in `validate`: a partner ring is someone else's input. */
const MAX_MEMBERS = 2000;
const MAX_TAGS = 16;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function text(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim().slice(0, max);
	return trimmed || undefined;
}

/** A member id when the ring gave none: stable for the same name and address. */
function derivedId(name: string, url: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	let hash = 0;
	for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
	return `${slug || 'member'}-${hash.toString(36)}`;
}

/**
 * Read one partner ring through its adapter. Never throws.
 *
 * A ring whose hub is not a public https address is refused whole: every card would link to it.
 * A member that fails is dropped with a reason and the rest are kept, the same rule `validate`
 * applies to the IndieNodes ring.
 */
export function readPartnerRing(adapter: PartnerAdapter, document: unknown): PartnerRingResult {
	const dropped: PartnerRingResult['dropped'] = [];
	const name = text(adapter.ring.name, 80);
	const hub = normalizeUrl(adapter.ring.hubUrl);
	const empty = (reason: string): PartnerRingResult => ({
		ring: adapter.ring,
		members: [],
		dropped: [{ index: -1, reason }, ...dropped]
	});

	if (!ID_PATTERN.test(adapter.ring.id)) return empty('ring id is missing or malformed');
	if (!name) return empty('ring has no name');
	if (!hub) return empty('ring hub is missing, not https, or not public');

	const info: PartnerRingInfo = { id: adapter.ring.id, name, hubUrl: hub };

	let candidates: PartnerCandidate[];
	try {
		candidates = adapter.read(document);
	} catch {
		return {
			ring: info,
			members: [],
			dropped: [{ index: -1, reason: 'adapter failed to read the document' }]
		};
	}
	if (!Array.isArray(candidates) || !candidates.length) {
		return { ring: info, members: [], dropped: [{ index: -1, reason: 'no members found' }] };
	}
	if (candidates.length > MAX_MEMBERS) {
		dropped.push({ index: -1, reason: `member count ${candidates.length} exceeds ${MAX_MEMBERS}` });
	}

	const can = new Set<PartnerCapability>(adapter.capabilities);
	const seen = new Set<string>();
	const members: PartnerMember[] = [];

	candidates.slice(0, MAX_MEMBERS).forEach((candidate, index) => {
		if (!candidate || typeof candidate !== 'object') {
			dropped.push({ index, reason: 'member is not an object' });
			return;
		}
		const memberName = text(candidate.name, 100);
		if (!memberName) {
			dropped.push({ index, reason: 'missing name' });
			return;
		}
		if (!safeUrl(candidate.url)) {
			dropped.push({ index, reason: 'url is missing, not https, or not public' });
			return;
		}
		const url = normalizeUrl(candidate.url) as string;

		const given = text(candidate.id, 80)?.toLowerCase();
		const id = given && ID_PATTERN.test(given) ? given : derivedId(memberName, url);
		if (seen.has(id)) {
			dropped.push({ index, reason: 'duplicate id' });
			return;
		}
		seen.add(id);

		const member: PartnerMember = {
			ringId: info.id,
			id,
			name: memberName,
			url,
			layout: can.has('layout') ? layoutOf(candidate.layout) : 'mobile-friendly'
		};
		const blurb = text(candidate.blurb, 200);
		if (blurb) member.blurb = blurb;

		if (can.has('thumbnails')) {
			const thumb = normalizeUrl(candidate.thumbUrl);
			if (thumb) member.thumbUrl = thumb;
		}
		if (can.has('tags') && Array.isArray(candidate.tags)) {
			const tags = [
				...new Set(
					candidate.tags.flatMap((tag) => {
						const clean = text(tag, 40)?.toLowerCase();
						return clean ? [clean] : [];
					})
				)
			].slice(0, MAX_TAGS);
			if (tags.length) member.tags = tags;
		}
		if (can.has('sensitive')) member.sensitive = candidate.sensitive === true;
		if (can.has('preview')) {
			const preview = safeUrl(candidate.previewUrl)
				? normalizeUrl(candidate.previewUrl)
				: undefined;
			if (preview) member.previewUrl = preview;
		}

		members.push(member);
	});

	return { ring: info, members, dropped };
}

/**
 * What kind of thing a member's own `previewUrl` actually is, guessed from the URL alone: no
 * fetch, no verification, the same "read the shape of the address" technique `@yipden/feeds`'
 * `feedKindFromUrl` already uses for a feed. The point is not to make more of these playable in
 * app (nothing here ever is; see `PartnerMember.previewUrl`), only to say honestly what a reader
 * is about to open before they tap it: a file loads in a second, a platform page might ask for
 * an account, and a paywalled one might ask for a subscription.
 */
export const PREVIEW_KINDS = [
	'file',
	'youtube',
	'soundcloud',
	'bandcamp',
	'spotify',
	'apple-music',
	'external'
] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)(\?|$)/i;

export function previewKindOf(url: string): PreviewKind {
	const parsed = safeUrl(url);
	if (!parsed) return 'external';

	const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
	if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
		return 'youtube';
	}
	if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return 'soundcloud';
	if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return 'bandcamp';
	if (host === 'spotify.com' || host.endsWith('.spotify.com')) return 'spotify';
	if (host === 'music.apple.com') return 'apple-music';
	// Checked after the platform hosts above, not before: a platform URL with a path that
	// happens to end in one of these is still that platform, never mistaken for a bare file.
	if (AUDIO_EXTENSIONS.test(parsed.pathname)) return 'file';
	return 'external';
}
