import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
	directCursor,
	FeedHttp,
	FeedParseError,
	HttpError,
	type FeedSource,
	type FetchLike,
	type HttpResponse
} from '@yipden/feeds';
import { IdbStore } from './store/idb.js';
import { setAgeLimitActive } from './age.js';
import { categorize, classifyFailure, pruneToMaxAge, refreshAll, toStoredYip } from './refresh.js';
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

/**
 * Real YouTube shape, confirmed live 2026-09-28: `media:content` still declares this exact
 * legacy type on an extensionless URL, on every channel, not a fixture artifact.
 */
const ONE_YOUTUBE = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
	<title>Lena Ofori</title>
	<link rel="alternate" href="https://www.youtube.com/channel/UCexample0123456789abcd"/>
	<entry>
		<id>yt:video:abc12345678</id>
		<title>A new video</title>
		<link rel="alternate" href="https://www.youtube.com/watch?v=abc12345678"/>
		<published>2026-09-15T14:02:00+00:00</published>
		<media:group>
			<media:content url="https://www.youtube.com/v/abc12345678?version=3" type="application/x-shockwave-flash"/>
			<media:thumbnail url="https://i2.ytimg.com/vi/abc12345678/hqdefault.jpg"/>
		</media:group>
	</entry>
</feed>`;

function response(
	status: number,
	body: string,
	headers: Record<string, string> = {},
	url = 'https://lena.example.com/feed.xml'
): HttpResponse {
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return {
		status,
		url,
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
	// Fixture dates are fixed; keep them from aging out as the real clock moves on.
	await store.setSetting('maxAgeDays', 3650);
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
		expect(yip.feedId).toBe('https://lena.example.com/feed.xml');
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

	it('sorts a YouTube video into Watch, not Posts', async () => {
		const youtubeUrl =
			'https://www.youtube.com/feeds/videos.xml?channel_id=UCexample0123456789abcd';
		const youtubeFeed = feed({ id: youtubeUrl, url: youtubeUrl, kind: 'youtube' });
		await store.follow(PERSON, [youtubeFeed]);

		const result = await refreshAll({
			store,
			feedIds: [youtubeFeed.id],
			http: fastHttp(
				fakeFetch(() =>
					response(200, ONE_YOUTUBE, { 'content-type': 'application/atom+xml' }, youtubeUrl)
				)
			)
		});

		expect(result.added).toBe(1);
		const [yip] = await store.listYips({ feedIds: [youtubeUrl] });
		expect(yip).toMatchObject({ category: 'watch', feedKind: 'youtube' });
	});

	it("saves the source's cursor for the next request", async () => {
		await refreshAll({
			store,
			http: fastHttp(fakeFetch(() => response(200, ONE_POST, { etag: 'W/"v1"' })))
		});
		const [saved] = await store.listFeeds();
		expect(saved?.cursor).toBe(directCursor({ etag: 'W/"v1"' }));
	});

	it('starts a record saved before cursors from its old validators, then drops them', async () => {
		await store.updateFeed({
			...feed(),
			etag: 'W/"old"',
			lastModified: 'Mon, 21 Sep 2026 00:00:00 GMT'
		});
		const seen: Array<Record<string, string> | undefined> = [];
		await refreshAll({
			store,
			http: fastHttp(async (_url, init) => {
				seen.push(init?.headers);
				return response(304, '');
			})
		});

		expect(seen[0]?.['if-none-match']).toBe('W/"old"');
		const [saved] = await store.listFeeds();
		expect(saved?.etag).toBeUndefined();
		expect(saved?.lastModified).toBeUndefined();
		expect(saved?.cursor).toBe(
			directCursor({ etag: 'W/"old"', lastModified: 'Mon, 21 Sep 2026 00:00:00 GMT' })
		);
	});

	it('records a hub the feed announces', async () => {
		await refreshAll({
			store,
			http: fastHttp(
				fakeFetch(() => response(200, ONE_POST, { link: '<https://hub.example/>; rel="hub"' }))
			)
		});
		const [saved] = await store.listFeeds();
		expect(saved?.hubUrl).toBe('https://hub.example/');
	});

	it('keeps keying yips by the entry id, so nothing already stored is duplicated', async () => {
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		const [yip] = await store.listYips();
		expect(yip?.key).toBe(`${feed().id}::https://lena.example.com/1`);
		expect(yip?.entryId).toBe('https://lena.example.com/1');
		expect(yip?.id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('takes yips from whatever source it is given, failures included', async () => {
		const source: FeedSource = {
			async *fetchBatch(requests) {
				for (const request of requests) {
					yield { id: 'not-asked-for', status: 'not-modified' };
					yield { id: request.id, status: 'failed', error: new HttpError('nope', 410) };
				}
			}
		};
		const result = await refreshAll({ store, source });
		expect(result.feeds).toEqual([
			expect.objectContaining({
				feedId: feed().id,
				status: 'failed',
				problem: { kind: 'gone', status: 410 }
			})
		]);
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

	it('records why a check failed, and clears it once the feed recovers', async () => {
		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(404, 'gone'))) });
		let [after] = await store.listFeeds();
		expect(after?.lastError).toEqual({ kind: 'gone', status: 404 });

		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, '<html></html>'))) });
		[after] = await store.listFeeds();
		expect(after?.lastError).toEqual({ kind: 'not-a-feed' });
		expect(after?.failures).toBe(2);

		await refreshAll({ store, http: fastHttp(fakeFetch(() => response(200, ONE_POST))) });
		[after] = await store.listFeeds();
		expect(after?.lastError).toBeUndefined();
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

describe('max age', () => {
	// The limit is switched off app-wide while debugging (see age.ts); these tests turn it on.
	beforeEach(() => setAgeLimitActive(true));
	afterEach(() => setAgeLimitActive(false));

	const NOW = new Date('2026-09-30T00:00:00.000Z');
	const MIXED = RSS(`<item><title>Recent</title><link>https://lena.example.com/new</link>
		<pubDate>Mon, 21 Sep 2026 14:02:00 GMT</pubDate></item>
		<item><title>Old</title><link>https://lena.example.com/old</link>
		<pubDate>Mon, 01 Jun 2026 14:02:00 GMT</pubDate></item>`);

	async function run() {
		const http = fastHttp(fakeFetch(() => response(200, MIXED)));
		await refreshAll({ store, http, now: () => NOW });
		return (await store.listAllYips()).map((yip) => yip.title).sort();
	}

	it('does not store posts older than the default 30 days', async () => {
		await store.setSetting('maxAgeDays', 30);
		expect(await run()).toEqual(['Recent']);
	});

	it('uses the reader setting, and a person override beats it', async () => {
		expect(await run()).toEqual(['Old', 'Recent']);

		await store.updatePerson({ ...PERSON, maxAgeDays: 7 });
		await store.clearYips();
		expect(await run()).toEqual([]);
	});

	it('prunes what is already stored when the limit shrinks', async () => {
		await run();
		await store.setSetting('maxAgeDays', 30);
		await pruneToMaxAge(store, () => NOW);
		expect((await store.listAllYips()).map((yip) => yip.title)).toEqual(['Recent']);
	});
});

describe('classifyFailure', () => {
	it('tells a broken feed apart from a site that could not be reached', () => {
		expect(classifyFailure(new FeedParseError('not a feed'))).toEqual({ kind: 'not-a-feed' });
		expect(classifyFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'offline' });
		expect(classifyFailure(new HttpError('request aborted'))).toEqual({ kind: 'offline' });
	});

	it('sorts HTTP answers by what a reader can do about them', () => {
		expect(classifyFailure(new HttpError('x', 404))).toEqual({ kind: 'gone', status: 404 });
		expect(classifyFailure(new HttpError('x', 410))).toEqual({ kind: 'gone', status: 410 });
		expect(classifyFailure(new HttpError('x', 403))).toEqual({ kind: 'refused', status: 403 });
		expect(classifyFailure(new HttpError('x', 503))).toEqual({ kind: 'server', status: 503 });
		expect(classifyFailure(new HttpError('x', 429))).toEqual({ kind: 'server', status: 429 });
		expect(classifyFailure(new HttpError('robots.txt disallows /feed', 999))).toEqual({
			kind: 'blocked'
		});
		expect(classifyFailure(new HttpError('response exceeded the size cap'))).toEqual({
			kind: 'unreadable'
		});
	});
});
