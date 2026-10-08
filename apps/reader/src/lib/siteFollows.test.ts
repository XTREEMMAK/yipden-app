import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	HttpError,
	type FeedRequest,
	type FeedResult,
	type FeedSource,
	type Item
} from '@yipden/feeds';
import { setAgeLimitActive } from './age.js';
import {
	BACKOFF_AFTER,
	isDue,
	MAX_PER_CHECK,
	siteFollows,
	toUpdate,
	type SiteFollowsDeps
} from './siteFollows.svelte.js';
import { ROBOTS_STATUS } from './refresh.js';
import { testStore } from './store/testing/memory.js';
import type { SiteFollow, Store } from './store/types.js';

const SITE = 'https://medjed.example/';
const FEED = 'https://medjed.example/rss.xml';
const NOW = new Date('2026-10-08T12:00:00.000Z');

function item(n: number, overrides: Partial<Item> = {}): Item {
	return {
		id: `item-${n}`,
		title: `Post ${n}`,
		url: `https://medjed.example/posts/${n}`,
		publishedAt: new Date(NOW.getTime() - n * 3_600_000).toISOString(),
		summary: `Words of post ${n}.`,
		contentHtml: null,
		media: [],
		sourceFeedId: FEED,
		...overrides
	};
}

type Reply = FeedResult | ((request: FeedRequest) => FeedResult);

/** A source that answers from a table, and records what it was asked. */
function fakeSource(replies: Record<string, Reply>) {
	const asked: FeedRequest[] = [];
	const source: FeedSource = {
		async *fetchBatch(requests) {
			for (const request of requests) {
				asked.push(request);
				const reply = replies[request.url];
				if (!reply) {
					yield { id: request.id, status: 'failed', error: new HttpError('nope', 404) };
				} else {
					yield typeof reply === 'function' ? reply(request) : { ...reply, id: request.id };
				}
			}
		}
	};
	return { source, asked };
}

const updated = (items: Item[], cursor?: string): FeedResult => ({
	id: '',
	status: 'updated',
	url: FEED,
	...(cursor ? { cursor } : {}),
	feed: {
		id: FEED,
		title: 'Medjed',
		siteUrl: SITE,
		description: '',
		iconUrl: null,
		format: 'rss',
		kind: 'blog',
		items
	}
});

let store: Store;
let current: ReturnType<typeof fakeSource>;
let now = NOW;

function use(replies: Record<string, Reply>) {
	current = fakeSource(replies);
	siteFollows.deps = (): SiteFollowsDeps => ({ source: current.source, store, now: () => now });
}

beforeEach(async () => {
	setAgeLimitActive(true);
	now = NOW;
	store = testStore();
	use({ [FEED]: updated([item(1), item(2), item(3)]) });
	await siteFollows.reload();
});

const SITE_FOLLOWABLE = { siteUrl: SITE, feedUrl: FEED, title: 'Medjed' };

describe('following a site', () => {
	it('follows it and checks it at once, so its posts are there the first time', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		expect(siteFollows.follows.map((follow) => follow.id)).toEqual([SITE]);
		expect(siteFollows.follows[0]).toMatchObject({ status: 'ok', refreshHours: 6, failures: 0 });
		expect(siteFollows.digest.map((entry) => entry.record.title)).toEqual([
			'Post 1',
			'Post 2',
			'Post 3'
		]);
		expect(siteFollows.activeCount).toBe(3);
	});

	it('knows an address however it is spelled', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		expect(siteFollows.isFollowing('https://www.medjed.example')).toBe(true);
		expect(siteFollows.isFollowing('https://elsewhere.example/')).toBe(false);
	});

	it('follows a second time without losing what it had, but reads a different feed fresh', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		const first = siteFollows.follows[0]!;
		use({ 'https://medjed.example/other.xml': updated([item(9)], 'c1') });
		await siteFollows.follow({ ...SITE_FOLLOWABLE, feedUrl: 'https://medjed.example/other.xml' });
		expect(siteFollows.follows).toHaveLength(1);
		expect(siteFollows.follows[0]).toMatchObject({
			followedAt: first.followedAt,
			feedUrl: 'https://medjed.example/other.xml',
			cursor: 'c1'
		});
	});

	it('keeps only the newest posts of a long feed', async () => {
		use({ [FEED]: updated(Array.from({ length: 80 }, (_, n) => item(n + 1))) });
		await siteFollows.follow(SITE_FOLLOWABLE);
		expect(siteFollows.updates).toHaveLength(MAX_PER_CHECK);
	});

	it('does not keep a post older than the reader’s limit for posts', async () => {
		use({ [FEED]: updated([item(1), item(24 * 60)]) });
		await siteFollows.follow(SITE_FOLLOWABLE);
		expect(siteFollows.updates.map((entry) => entry.title)).toEqual(['Post 1']);
	});
});

describe('the digest', () => {
	it('is newest first, and a post opened is no longer new', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		const first = siteFollows.digest[0]!.record;
		const url = await siteFollows.open(first);
		expect(url).toBe('https://medjed.example/posts/1');
		expect(siteFollows.activeCount).toBe(2);
		expect(siteFollows.digest[0]!.isNew).toBe(false);
		await siteFollows.markAllSeen();
		expect(siteFollows.activeCount).toBe(0);
	});

	it('keeps what was opened when the same post comes back in a later check', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		await siteFollows.open(siteFollows.digest[0]!.record);
		now = new Date(NOW.getTime() + 7 * 3_600_000);
		await siteFollows.refresh({ force: true });
		expect(siteFollows.digest.find((entry) => entry.record.title === 'Post 1')!.isNew).toBe(false);
	});

	it('shows a post behind a content warning with no summary', () => {
		const follow = { id: SITE, siteUrl: SITE } as SiteFollow;
		expect(
			toUpdate(follow, item(1, { contentWarning: 'spoilers' }), '2026-10-08T00:00:00.000Z').summary
		).toBe('');
		expect(toUpdate(follow, item(1, { sensitive: true }), '2026-10-08T00:00:00.000Z').summary).toBe(
			''
		);
		expect(toUpdate(follow, item(1, { title: 'Untitled' }), '2026-10-08T00:00:00.000Z').title).toBe(
			'medjed.example'
		);
	});

	it('takes a followed site’s posts away with it when it is unfollowed', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		await siteFollows.unfollow(SITE);
		expect(siteFollows.follows).toEqual([]);
		expect(siteFollows.updates).toEqual([]);
	});
});

describe('checking', () => {
	it('checks only what is due, and everything when forced', async () => {
		await siteFollows.follow(SITE_FOLLOWABLE);
		const before = current.asked.length;
		now = new Date(NOW.getTime() + 3_600_000);
		await siteFollows.refresh();
		expect(current.asked.length).toBe(before);
		await siteFollows.refresh({ force: true });
		expect(current.asked.length).toBe(before + 1);
	});

	it('hands the last answer’s cursor back, so an unchanged site costs nothing', async () => {
		use({ [FEED]: updated([item(1)], 'etag-1') });
		await siteFollows.follow(SITE_FOLLOWABLE);
		use({ [FEED]: { id: '', status: 'not-modified' } });
		now = new Date(NOW.getTime() + 7 * 3_600_000);
		await siteFollows.refresh();
		expect(current.asked[0]!.cursor).toBe('etag-1');
		expect(siteFollows.follows[0]).toMatchObject({ status: 'ok', failures: 0 });
	});

	it('says what went wrong for a site, and one failing never stops another', async () => {
		const other = 'https://other.example/';
		use({
			[FEED]: { id: '', status: 'failed', error: new HttpError('gone', 404) },
			'https://other.example/rss.xml': updated([item(5, { url: 'https://other.example/p/5' })])
		});
		await siteFollows.follow(SITE_FOLLOWABLE);
		await siteFollows.follow({
			siteUrl: other,
			feedUrl: 'https://other.example/rss.xml',
			title: 'Other'
		});
		const byId = new Map(siteFollows.follows.map((follow) => [follow.id, follow]));
		expect(byId.get(SITE)).toMatchObject({ status: 'gone', failures: 1 });
		expect(byId.get(other)).toMatchObject({ status: 'ok', failures: 0 });
		expect(siteFollows.updates).toHaveLength(1);
	});

	it('calls a robots.txt refusal blocked, not gone', async () => {
		use({ [FEED]: { id: '', status: 'failed', error: new HttpError('robots', ROBOTS_STATUS) } });
		await siteFollows.follow(SITE_FOLLOWABLE);
		expect(siteFollows.follows[0]).toMatchObject({ status: 'blocked', failures: 1 });
	});

	it('asks a long-failing site a quarter as often', () => {
		const base: SiteFollow = {
			id: SITE,
			siteUrl: SITE,
			feedUrl: FEED,
			title: 'M',
			followedAt: '2026-10-01T00:00:00.000Z',
			refreshHours: 6,
			status: 'gone',
			failures: BACKOFF_AFTER,
			lastCheckedAt: new Date(NOW.getTime() - 7 * 3_600_000).toISOString()
		};
		expect(isDue({ ...base, failures: 1 }, NOW)).toBe(true);
		expect(isDue(base, NOW)).toBe(false);
		expect(
			isDue({ ...base, lastCheckedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }, NOW)
		).toBe(true);
		const never = { ...base };
		delete never.lastCheckedAt;
		expect(isDue(never, NOW)).toBe(true);
	});
});
