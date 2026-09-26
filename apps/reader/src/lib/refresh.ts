import { FeedHttp, parseFeed, type FetchLike, type Item } from '@yipden/feeds';
import { httpFetch } from './platform/http.js';
import { store as defaultStore } from './store/index.js';
import type { Feed, Store, StoredYip, YipCategory } from './store/types.js';

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
}

export interface RefreshResult {
	feeds: FeedRefreshResult[];
	added: number;
}

/** Consecutive failures past this point stop being retried automatically. */
const MAX_AUTO_FAILURES = 5;

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
				await store.updateFeed({ ...feed, lastFetchedAt: fetchedAt, failures: 0 });
				results.push({ feedId: feed.id, status: 'not-modified', added: 0 });
				continue;
			}

			const parsed = parseFeed(response.body, {
				feedUrl: response.url,
				contentType: response.contentType
			});

			const yips = parsed.items.map((item) => toStoredYip(item, feed, feed.personId, fetchedAt));
			const { added } = await store.putYips(yips);
			totalAdded += added;

			await store.updateFeed({
				...feed,
				url: response.url,
				kind: parsed.kind,
				...(parsed.title ? { title: parsed.title } : {}),
				...(response.etag ? { etag: response.etag } : {}),
				...(response.lastModified ? { lastModified: response.lastModified } : {}),
				lastFetchedAt: fetchedAt,
				failures: 0
			});

			results.push({ feedId: feed.id, status: 'updated', added });
		} catch (cause) {
			await store.updateFeed({
				...feed,
				lastFetchedAt: now().toISOString(),
				failures: feed.failures + 1
			});
			results.push({
				feedId: feed.id,
				status: 'failed',
				added: 0,
				error: cause instanceof Error ? cause.message : String(cause)
			});
		}
	}

	return { feeds: results, added: totalAdded };
}
