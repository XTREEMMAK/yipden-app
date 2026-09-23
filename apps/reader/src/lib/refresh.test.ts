import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FeedHttp, type FetchLike, type HttpResponse } from '@yipden/feeds';
import { IdbStore } from './store/idb.js';
import { categorize, refreshAll, toStoredYip } from './refresh.js';
import type { Feed, Item, Person } from './store/types.js';

const PERSON: Person = {
	id: 'person-lena',
	name: 'Lena',
	siteUrl: 'https://lena.example.com/',
	followedAt: '2026-09-20T00:00:00.000Z'
};

function feed(overrides: Partial<Feed> = {}): Feed {
	return {
		id: 'https://lena.example.com/feed.xml',
		personId: 'person-lena',
		url: 'https://lena.example.com/feed.xml',
		kind: 'blog',
		title: 'Lena',
		verified: true,
		failures: 0,
		enabled: true,
		...overrides
	};
}

const RSS = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena</title><link>https://lena.example.com/</link><description>Posts.</description>
	${items}
</channel></rss>`;

const ONE_POST = RSS(`<item><title>Hello</title><link>https://lena.example.com/1</link>
	<pubDate>Mon, 15 Sep 2026 14:02:00 GMT</pubDate></item>`);

const ONE_AUDIO = RSS(`<item><title>Episode</title><link>https://lena.example.com/e1</link>
	<pubDate>Mon, 15 Sep 2026 14:02:00 GMT</pubDate>
	<enclosure url="https://lena.example.com/e1.mp3" type="audio/mpeg"/></item>`);

const ONE_VIDEO = RSS(`<item><title>A video</title><link>https://lena.example.com/v1</link>
	<pubDate>Mon, 15 Sep 2026 14:02:00 GMT</pubDate>
	<enclosure url="https://lena.example.com/v1.mp4" type="video/mp4"/></item>`);

function response(
	status: number,
	body: string,
	headers: Record<string, string> = {}
): HttpResponse {
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return {
		status,
		url: 'https://lena.example.com/feed.xml',
		headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
		text: async () => body
	};
}

function fakeFetch(handler: (url: string) => HttpResponse | Promise<HttpResponse>): FetchLike {
	return async (url) => handler(url);
}

/**
 * A FeedHttp with robots.txt and the per-host throttle turned off, and no real waiting.
 *
 * The default client honors both, and a robots.txt preflight shares its per-host queue with
 * the real request, so two real network calls a second apart is correct politeness in
 * production and an unnecessary ~1s tax on every test here.
 */
function fastHttp(fetchImpl: FetchLike): FeedHttp {
	return new FeedHttp({ fetch: fetchImpl, respectRobots: false, minHostIntervalMs: 0 });
}

let store: IdbStore;

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	store = new IdbStore();
	await store.init();
	await store.follow(PERSON, [feed()]);
});

describe('categorize', () => {
	const base: Item = {
		id: '1',
		title: 't',
		url: 'https://example.com/1',
		publishedAt: null,
		summary: '',
		contentHtml: null,
		media: [],
		sourceFeedId: 'f'
	};

	it('is posts with no media', () => {
		expect(categorize(base)).toBe('posts');
	});

	it('is listen with audio', () => {
		expect(categorize({ ...base, media: [{ url: 'a', kind: 'audio' }] })).toBe('listen');
	});

	it('is watch with video, even alongside audio', () => {
		expect(
			categorize({
				...base,
				media: [
					{ url: 'a', kind: 'audio' },
					{ url: 'b', kind: 'video' }
				]
			})
		).toBe('watch');
	});

	it('is posts with only an image', () => {
		expect(categorize({ ...base, media: [{ url: 'a', kind: 'image' }] })).toBe('posts');
	});
});

describe('toStoredYip', () => {
	it('keys a yip by feed and item id, so two feeds never collide', () => {
		const item: Item = {
			id: '1',
			title: 't',
			url: 'https://example.com/1',
			publishedAt: null,
			summary: '',
			contentHtml: null,
			media: [],
			sourceFeedId: 'f'
		};
		const yip = toStoredYip(item, feed(), 'person-lena', '2026-09-22T00:00:00.000Z');
		expect(yip.key).toBe('https://lena.example.com/feed.xml::1');
		expect(yip.personId).toBe('person-lena');
		expect(yip.feedKind).toBe('blog');
	});
});

describe('refreshAll', () => {
	it('stores what a feed publishes, categorized', async () => {
		const result = await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_AUDIO)))
		});

		expect(result.added).toBe(1);
		expect(result.feeds[0]).toMatchObject({ status: 'updated', added: 1 });
		const [yip] = await store.listYips();
		expect(yip?.category).toBe('listen');
	});

	it('saves the etag and last-modified for the next request', async () => {
		await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_POST, { etag: 'W/"v1"' })))
		});
		const [saved] = await store.listFeeds();
		expect(saved?.etag).toBe('W/"v1"');
	});

	it('sends the saved validators back on the next refresh', async () => {
		await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_POST, { etag: 'W/"v1"' })))
		});

		const seen: Array<Record<string, string> | undefined> = [];
		await refreshAll({
			store,
			http: fastHttp(async (_url, init) => {
				seen.push(init?.headers);
				return response(304, '');
			})
		});

		expect(seen[0]?.['if-none-match']).toBe('W/"v1"');
	});

	it('costs nothing when the feed answers 304', async () => {
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		const result = await refreshAll({ store, http: fastHttp(fakeFetch(() => response(304, ''))) });

		expect(result.added).toBe(0);
		expect(result.feeds[0]?.status).toBe('not-modified');
		expect(await store.listYips()).toHaveLength(1);
	});

	it('keeps a reader read state when the same item comes back', async () => {
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		const [first] = await store.listYips();
		await store.markRead(first!.key);

		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		const [after] = await store.listYips();
		expect(after?.readAt).toBeTruthy();
	});

	it('does not let one failing feed stop the rest', async () => {
		await store.follow(
			{ ...PERSON, id: 'person-sam', name: 'Sam', siteUrl: 'https://sam.example.com/' },
			[
				feed({
					id: 'https://sam.example.com/feed.xml',
					url: 'https://sam.example.com/feed.xml',
					personId: 'person-sam'
				})
			]
		);

		const result = await refreshAll({
			store,
			http: fastHttp(
				fakeFetch((url) => (url.includes('lena') ? response(200, ONE_POST) : response(500, 'oops')))
			)
		});

		expect(result.feeds.find((f) => f.feedId.includes('lena'))?.status).toBe('updated');
		expect(result.feeds.find((f) => f.feedId.includes('sam'))?.status).toBe('failed');
		expect(await store.listYips()).toHaveLength(1);
	});

	it('records the failure count rather than losing it', async () => {
		await refreshAll({
			store,
			http: fastHttp(async () => {
				throw new Error('offline');
			})
		});
		const [after] = await store.listFeeds();
		expect(after?.failures).toBe(1);
	});

	it('resets the failure count once a feed recovers', async () => {
		await store.updateFeed({ ...feed(), failures: 3 });
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		const [after] = await store.listFeeds();
		expect(after?.failures).toBe(0);
	});

	it('stops retrying a feed that has failed past the limit, without being asked to', async () => {
		await store.updateFeed({ ...feed(), failures: 5 });
		let calls = 0;
		const result = await refreshAll({
			store,
			http: fastHttp(
				fakeFetch(() => {
					calls += 1;
					return response(200, ONE_POST);
				})
			)
		});

		expect(calls).toBe(0);
		expect(result.feeds[0]?.status).toBe('disabled');
	});

	it('still refreshes a backed off feed when it is asked for by id', async () => {
		await store.updateFeed({ ...feed(), failures: 5 });
		const result = await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_POST))),
			feedIds: [feed().id]
		});

		expect(result.feeds[0]?.status).toBe('updated');
	});

	it('never touches a feed the reader disabled', async () => {
		await store.updateFeed({ ...feed(), enabled: false });
		const result = await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_POST)))
		});
		expect(result.feeds).toEqual([]);
	});

	it('sorts video ahead of a matching audio track into watch, not listen', async () => {
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_VIDEO))) });
		const [yip] = await store.listYips();
		expect(yip?.category).toBe('watch');
	});
});
