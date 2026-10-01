import {
	FeedHttp,
	FeedParseError,
	HttpError,
	parseFeed,
	type FetchLike,
	type Item
} from '@yipden/feeds';
import { httpFetch } from './platform/http.js';
import { store as defaultStore } from './store/index.js';
import type { Feed, FeedError, Store, StoredYip, YipCategory } from './store/types.js';
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
		key: `${feed.id}::${item.id}`,
		feedId: feed.id,
		personId,
		feedKind: feed.kind,
		category: categorize(item),
		seenAt: now
	};
}

export interface RefreshOptions {
	store?: Store;
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
export function classifyFailure(cause: unknown): FeedError {
	if (cause instanceof FeedParseError) return { kind: 'not-a-feed' };
	if (cause instanceof HttpError) {
		const { status } = cause;
		if (status === ROBOTS_STATUS) return { kind: 'blocked' };
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

export interface RefreshResult {
	feeds: FeedRefreshResult[];
	added: number;
}

/** Consecutive failures past this point stop being retried automatically. */
export const MAX_AUTO_FAILURES = 5;

/**
 * Refresh every followed feed, one at a time.
 *
 * Sequential rather than parallel: `FeedHttp` already limits itself to one request per host,
 * so running feeds in parallel would only mean more of them waiting at once, not finishing
 * sooner, while making a pull to refresh harder to reason about and to cancel.
 *
 * One feed failing never stops the rest. A dead blog should not silence everyone else a reader
 * follows, which is the same principle `ring-client`'s validation follows for ring entries.
 */
export async function refreshAll(options: RefreshOptions = {}): Promise<RefreshResult> {
	const {
		store = defaultStore,
		fetch: fetchImpl = httpFetch,
		http = new FeedHttp({ fetch: fetchImpl }),
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

	for (const feed of targets) {
		if (feed.failures >= MAX_AUTO_FAILURES && !feedIds) {
			results.push({ feedId: feed.id, status: 'disabled', added: 0 });
			continue;
		}

		try {
			const response = await http.get(feed.url, {
				...(feed.etag ? { etag: feed.etag } : {}),
				...(feed.lastModified ? { lastModified: feed.lastModified } : {})
			});

			const fetchedAt = now().toISOString();

			if (response.notModified) {
				await store.updateFeed({ ...healthy(feed), lastFetchedAt: fetchedAt });
				results.push({ feedId: feed.id, status: 'not-modified', added: 0 });
				continue;
			}

			const parsed = parseFeed(response.body, {
				feedUrl: response.url,
				contentType: response.contentType
			});

			// Posts older than the reader's limit are never stored. Undated ones are kept.
			const cutoff = ageCutoff(effectiveMaxAgeDays(people.get(feed.personId), defaultDays), now());
			prunable.set(feed.personId, cutoff);
			const yips = parsed.items
				.filter((item) => !isAgeLimitActive() || !item.publishedAt || item.publishedAt >= cutoff)
				.map((item) => toStoredYip(item, feed, feed.personId, fetchedAt));
			const { added } = await store.putYips(yips);
			totalAdded += added;

			await store.updateFeed({
				...healthy(feed),
				url: response.url,
				kind: parsed.kind,
				...(parsed.title ? { title: parsed.title } : {}),
				...(response.etag ? { etag: response.etag } : {}),
				...(response.lastModified ? { lastModified: response.lastModified } : {}),
				lastFetchedAt: fetchedAt
			});

			results.push({ feedId: feed.id, status: 'updated', added });
		} catch (cause) {
			const problem = classifyFailure(cause);
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

	return { feeds: results, added: totalAdded };
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
