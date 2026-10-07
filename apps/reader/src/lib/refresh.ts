import {
	scanPage,
	DirectFetchSource,
	directCursor,
	FeedHttp,
	FeedParseError,
	HttpError,
	type FeedRequest,
	type FeedSource,
	type FetchLike,
	type Item,
	channelIconFromPage,
	youtubeChannelPage
} from '@yipden/feeds';
import { httpFetch } from './platform/http.js';
import { store as defaultStore } from './store/index.js';
import type { Feed, FeedError, Person, Store, StoredYip, YipCategory } from './store/types.js';
import { ageCutoff, DEFAULT_MAX_AGE_DAYS, effectiveMaxAgeDays, isAgeLimitActive } from './age.js';

/**
 * Turning what people publish into what Feeds shows.
 *
 * One followed feed becomes zero or more yips, each stamped with the category Feeds' filter
 * pills read directly rather than recomputing on every render: a filter that has to inspect
 * every yip's media on every scroll is a filter that stutters.
 */

/** A yip with video is Watch; with audio and no video is Listen; anything else is a Post. */
export function categorize(item: Item): YipCategory {
	const hasVideo = item.media.some((media) => media.kind === 'video');
	if (hasVideo) return 'watch';
	const hasAudio = item.media.some((media) => media.kind === 'audio');
	if (hasAudio) return 'listen';
	return 'posts';
}

export function toStoredYip(item: Item, feed: Feed, personId: string, now: string): StoredYip {
	return {
		...item,
		// The stable id: the same yip from another device, a backup or the v2.0 cache matches it.
		key: item.id,
		feedId: feed.id,
		personId,
		feedKind: feed.kind,
		category: categorize(item),
		seenAt: now
	};
}

export interface RefreshOptions {
	store?: Store;
	/** Where yips come from. Defaults to each feed's own host, through `http`. */
	source?: FeedSource;
	fetch?: FetchLike;
	/**
	 * A prebuilt client, so a caller can turn off robots.txt or per-host throttling for a test.
	 * Production takes the default: robots.txt honored, one request per host at a time.
	 */
	http?: FeedHttp;
	/** Refresh only these feeds. Omitted means every enabled feed. */
	feedIds?: string[];
	now?: () => Date;
}

export interface FeedRefreshResult {
	feedId: string;
	status: 'updated' | 'not-modified' | 'disabled' | 'failed';
	added: number;
	error?: string;
	problem?: FeedError;
}

/** HttpError's own marker for a robots.txt refusal (see `FeedHttp.get`). */
const ROBOTS_STATUS = 999;

/** Sort a failed check into what a reader can act on. See `FeedProblem`. */
/**
 * YouTube's channel feeds answer 404 for hours at a time, for channels that are plainly there,
 * and have since December 2025: a 404 from one is YouTube's bad moment, not the feed moving.
 * It is a temporary problem, and never stops a feed being checked (phone feedback, 2026-10-07).
 */
function isYoutubeChannelFeed(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		// Any of YouTube's own feeds (a channel's, a playlist's): the same server answers them all.
		return (
			parsed.hostname.replace(/^www\./, '') === 'youtube.com' &&
			parsed.pathname === '/feeds/videos.xml'
		);
	} catch {
		return false;
	}
}

export function classifyFailure(cause: unknown, feedUrl?: string): FeedError {
	if (cause instanceof FeedParseError) return { kind: 'not-a-feed' };
	if (cause instanceof HttpError) {
		const { status } = cause;
		if (status === ROBOTS_STATUS) return { kind: 'blocked' };
		if (status === 404 && isYoutubeChannelFeed(feedUrl)) return { kind: 'server', status };
		if (status === 404 || status === 410) return { kind: 'gone', status };
		if (status === 401 || status === 403 || status === 451) return { kind: 'refused', status };
		if (status > 0) return { kind: 'server', status };
		// No status: either the request never completed, or YipDen itself declined to make or
		// finish it (an unsafe address, a redirect loop, a response over the size cap).
		return { kind: /aborted/i.test(cause.message) ? 'offline' : 'unreadable' };
	}
	// What a platform fetch throws when nothing answered: no connection, DNS, a reset.
	return { kind: 'offline' };
}

/** A feed record with its failure reason dropped, after a check that worked. */
function healthy(feed: Feed): Feed {
	const next: Feed = { ...feed, failures: 0 };
	delete next.lastError;
	return next;
}

/** The record after a check that worked, holding the source's new cursor in place of validators. */
function checked(feed: Feed, cursor: string | undefined, fetchedAt: string): Feed {
	const next: Feed = { ...healthy(feed), lastFetchedAt: fetchedAt };
	delete next.etag;
	delete next.lastModified;
	delete next.cursor;
	return cursor ? { ...next, cursor } : next;
}

/** What to ask the source for. A record from before cursors starts from its old validators. */
function requestFor(feed: Feed): FeedRequest {
	const cursor =
		feed.cursor ??
		directCursor({
			...(feed.etag ? { etag: feed.etag } : {}),
			...(feed.lastModified ? { lastModified: feed.lastModified } : {})
		});
	return { id: feed.id, url: feed.url, ...(cursor ? { cursor } : {}) };
}

export interface RefreshResult {
	feeds: FeedRefreshResult[];
	added: number;
}

/** Consecutive failures past this point stop being retried automatically. */
export const MAX_AUTO_FAILURES = 5;

/**
 * Whether checking this feed by itself has stopped. A YouTube channel feed whose failures are
 * YouTube's own 404s never stops, including one stopped before this rule existed.
 */
export function autoChecksStopped(feed: Feed): boolean {
	return feed.failures >= MAX_AUTO_FAILURES && !isYoutubeFlake(feed);
}

/** A YouTube channel feed whose last failure was YouTube's own 404. */
export function isYoutubeFlake(feed: Feed): boolean {
	return isYoutubeChannelFeed(feed.url) && feed.lastError?.status === 404;
}

/**
 * Refresh every followed feed, through the `FeedSource`.
 *
 * Results are stored as each arrives, so a refresh cut short keeps what it already fetched. One
 * feed failing never stops the rest. A dead blog should not silence everyone else a reader
 * follows, which is the same principle `ring-client`'s validation follows for ring entries.
 */
export async function refreshAll(options: RefreshOptions = {}): Promise<RefreshResult> {
	const {
		store = defaultStore,
		fetch: fetchImpl = httpFetch,
		http = new FeedHttp({ fetch: fetchImpl }),
		source = new DirectFetchSource({ http }),
		feedIds,
		now = () => new Date()
	} = options;

	await store.init();

	const allFeeds = await store.listFeeds();
	const targets = allFeeds.filter(
		(feed) => feed.enabled && (!feedIds || feedIds.includes(feed.id))
	);

	const people = new Map((await store.listPeople()).map((person) => [person.id, person]));
	const savedDefault = await store.getSetting<number>('maxAgeDays');
	const defaultDays = typeof savedDefault === 'number' ? savedDefault : DEFAULT_MAX_AGE_DAYS;
	const prunable = new Map<string, string>();

	const results: FeedRefreshResult[] = [];
	let totalAdded = 0;

	const due: Feed[] = [];
	for (const feed of targets) {
		if (autoChecksStopped(feed) && !feedIds) {
			results.push({ feedId: feed.id, status: 'disabled', added: 0 });
		} else {
			due.push(feed);
		}
	}
	const byId = new Map(due.map((feed) => [feed.id, feed]));

	for await (const result of source.fetchBatch(due.map(requestFor))) {
		const feed = byId.get(result.id);
		if (!feed) continue;

		try {
			if (result.status === 'failed') throw result.error;
			const fetchedAt = now().toISOString();

			if (result.status === 'not-modified') {
				await store.updateFeed(checked(feed, result.cursor ?? requestFor(feed).cursor, fetchedAt));
				results.push({ feedId: feed.id, status: 'not-modified', added: 0 });
				continue;
			}

			const parsed = result.feed;
			// Posts older than the reader's limit are never stored. Undated ones are kept.
			const cutoff = ageCutoff(effectiveMaxAgeDays(people.get(feed.personId), defaultDays), now());
			prunable.set(feed.personId, cutoff);
			const yips = parsed.items
				.filter((item) => !isAgeLimitActive() || !item.publishedAt || item.publishedAt >= cutoff)
				.map((item) => toStoredYip(item, feed, feed.personId, fetchedAt));
			const { added } = await store.putYips(yips);
			totalAdded += added;

			const iconUrl = feed.iconUrl ?? (await channelIcon(http, result.url));
			await store.updateFeed({
				...checked(feed, result.cursor, fetchedAt),
				url: result.url,
				kind: parsed.kind,
				...(parsed.title ? { title: parsed.title } : {}),
				...(result.hubUrl ? { hubUrl: result.hubUrl } : {}),
				...(iconUrl !== undefined ? { iconUrl } : {})
			});

			results.push({ feedId: feed.id, status: 'updated', added });
		} catch (cause) {
			const problem = classifyFailure(cause, feed.url);
			await store.updateFeed({
				...feed,
				lastFetchedAt: now().toISOString(),
				failures: feed.failures + 1,
				lastError: problem
			});
			results.push({
				feedId: feed.id,
				status: 'failed',
				added: 0,
				error: cause instanceof Error ? cause.message : String(cause),
				problem
			});
		}
	}

	if (isAgeLimitActive()) {
		for (const [personId, cutoff] of prunable) await store.pruneYips(personId, cutoff);
	}

	// Only people this refresh actually checked: one whose feeds have all given up is left alone.
	const checkedPeople = new Set(due.map((feed) => feed.personId));
	await backfillPersonIcons(
		store,
		http,
		[...people.values()].filter((person) => checkedPeople.has(person.id))
	);

	return { feeds: results, added: totalAdded };
}

/** How many people's sites one refresh may read for a missing picture: a few, politely. */
const ICONS_PER_REFRESH = 5;

/**
 * A followed person with no picture gets one from their own site: their h-card photo, else the
 * site's icon. Some follows start without one (a pasted link whose page named none at the time),
 * and their profile showed a picture that Feeds and You never had (phone feedback, 2026-10-07).
 * '' is kept when the site has none, so it is asked once, as a channel's avatar is.
 */
async function backfillPersonIcons(store: Store, http: FeedHttp, people: Person[]): Promise<void> {
	const missing = people
		.filter((person) => person.iconUrl === undefined)
		.slice(0, ICONS_PER_REFRESH);
	for (const person of missing) {
		try {
			const response = await http.get(person.siteUrl, {
				accept: 'text/html,application/xhtml+xml;q=0.9'
			});
			const page = scanPage(response.body, response.url);
			await store.updatePerson({ ...person, iconUrl: page.photoUrl ?? page.iconUrl ?? '' });
		} catch {
			// Offline or refused: asked again on the next refresh.
		}
	}
}

/**
 * A YouTube channel feed's avatar, read once from the channel page: '' when the page has none,
 * so it is not asked again; undefined for any other feed, or when the page could not be reached.
 */
async function channelIcon(http: FeedHttp, feedUrl: string): Promise<string | undefined> {
	const page = youtubeChannelPage(feedUrl);
	if (!page) return undefined;
	try {
		const response = await http.get(page, { accept: 'text/html' });
		return channelIconFromPage(response.body) ?? '';
	} catch {
		// Offline or refused: asked again on the next refresh.
		return undefined;
	}
}

/** Apply the age limits to what is already stored, after the reader changes one. */
export async function pruneToMaxAge(
	store: Store = defaultStore,
	now: () => Date = () => new Date()
): Promise<void> {
	if (!isAgeLimitActive()) return;
	await store.init();
	const saved = await store.getSetting<number>('maxAgeDays');
	const defaultDays = typeof saved === 'number' ? saved : DEFAULT_MAX_AGE_DAYS;
	for (const person of await store.listPeople()) {
		await store.pruneYips(person.id, ageCutoff(effectiveMaxAgeDays(person, defaultDays), now()));
	}
}
