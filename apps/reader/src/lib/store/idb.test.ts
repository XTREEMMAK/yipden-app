import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStore } from './idb.js';
import type { Feed, Person, StoredYip } from './types.js';

function person(overrides: Partial<Person> = {}): Person {
	return {
		id: 'person-lena',
		name: 'Lena',
		siteUrl: 'https://lena.example.com/',
		followedAt: '2026-09-20T10:00:00.000Z',
		...overrides
	};
}

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

function yip(overrides: Partial<StoredYip> = {}): StoredYip {
	return {
		key: 'https://lena.example.com/feed.xml::1',
		id: '1',
		title: 'A post',
		url: 'https://lena.example.com/1',
		publishedAt: '2026-09-20T10:00:00.000Z',
		summary: 'Something happened.',
		contentHtml: null,
		media: [],
		sourceFeedId: 'https://lena.example.com/feed.xml',
		personId: 'person-lena',
		feedKind: 'blog',
		category: 'posts',
		seenAt: '2026-09-20T11:00:00.000Z',
		...overrides
	};
}

let store: IdbStore;

beforeEach(async () => {
	// A fresh database per test, so nothing leaks between them.
	globalThis.indexedDB = new IDBFactory();
	store = new IdbStore();
	await store.init();
});

describe('following', () => {
	it('stores a person and their feeds together', async () => {
		await store.follow(person(), [feed(), feed({ id: 'https://bsky.app/x/rss', kind: 'bluesky' })]);

		expect(await store.listPeople()).toHaveLength(1);
		expect(await store.listFeeds('person-lena')).toHaveLength(2);
	});

	it('knows whether a site is already followed', async () => {
		await store.follow(person(), [feed()]);

		expect(await store.isFollowing('https://lena.example.com/')).toBe(true);
		expect(await store.isFollowing('https://someone.example.com/')).toBe(false);
	});

	it('takes the person, their feeds and their yips away together', async () => {
		await store.follow(person(), [feed()]);
		await store.putYips([yip()]);

		await store.unfollow('person-lena');

		expect(await store.listPeople()).toEqual([]);
		expect(await store.listFeeds()).toEqual([]);
		expect(await store.listYips()).toEqual([]);
	});

	it('leaves other people alone when one is unfollowed', async () => {
		await store.follow(person(), [feed()]);
		await store.follow(person({ id: 'person-sam', name: 'Sam', siteUrl: 'https://sam.example/' }), [
			feed({ id: 'https://sam.example/feed', personId: 'person-sam' })
		]);

		await store.unfollow('person-lena');

		expect((await store.listPeople()).map((p) => p.id)).toEqual(['person-sam']);
		expect(await store.listFeeds()).toHaveLength(1);
	});

	it('lists people by name', async () => {
		await store.follow(person({ id: 'b', name: 'Zoe', siteUrl: 'https://z.example/' }), []);
		await store.follow(person({ id: 'a', name: 'Ada', siteUrl: 'https://a.example/' }), []);

		expect((await store.listPeople()).map((p) => p.name)).toEqual(['Ada', 'Zoe']);
	});
});

describe('yips', () => {
	it('counts only what is new', async () => {
		expect(await store.putYips([yip(), yip({ key: 'two', id: '2' })])).toEqual({ added: 2 });
		expect(await store.putYips([yip(), yip({ key: 'three', id: '3' })])).toEqual({ added: 1 });
	});

	it('does not resurrect a read yip when its feed republishes it', async () => {
		await store.putYips([yip()]);
		await store.markRead(yip().key);

		await store.putYips([yip({ title: 'A post, edited' })]);

		const [stored] = await store.listYips();
		expect(stored?.title).toBe('A post, edited');
		expect(stored?.readAt).toBeTruthy();
	});

	it('keeps the original seenAt, so "new" means new to this reader', async () => {
		await store.putYips([yip()]);
		await store.putYips([yip({ seenAt: '2027-01-01T00:00:00.000Z' })]);

		expect((await store.listYips())[0]?.seenAt).toBe('2026-09-20T11:00:00.000Z');
	});

	it('returns newest first', async () => {
		await store.putYips([
			yip({ key: 'old', publishedAt: '2026-09-01T00:00:00.000Z' }),
			yip({ key: 'new', publishedAt: '2026-09-21T00:00:00.000Z' }),
			yip({ key: 'middle', publishedAt: '2026-09-10T00:00:00.000Z' })
		]);

		expect((await store.listYips()).map((item) => item.key)).toEqual(['new', 'middle', 'old']);
	});

	it('filters by the pane a yip belongs to', async () => {
		await store.putYips([
			yip({ key: 'a', category: 'posts' }),
			yip({ key: 'b', category: 'listen' }),
			yip({ key: 'c', category: 'watch' })
		]);

		expect(await store.listYips({ filter: 'listen' })).toHaveLength(1);
		expect(await store.listYips({ filter: 'everything' })).toHaveLength(3);
	});

	it('pages with a cursor', async () => {
		await store.putYips([
			yip({ key: 'a', publishedAt: '2026-09-03T00:00:00.000Z' }),
			yip({ key: 'b', publishedAt: '2026-09-02T00:00:00.000Z' }),
			yip({ key: 'c', publishedAt: '2026-09-01T00:00:00.000Z' })
		]);

		const first = await store.listYips({ limit: 2 });
		expect(first.map((item) => item.key)).toEqual(['a', 'b']);

		const next = await store.listYips({ before: first[1]?.publishedAt ?? undefined, limit: 2 });
		expect(next.map((item) => item.key)).toEqual(['c']);
	});

	it('counts unread yips and the people they came from', async () => {
		await store.putYips([
			yip({ key: 'a' }),
			yip({ key: 'b' }),
			yip({ key: 'c', personId: 'person-sam' })
		]);
		await store.markRead('a');

		expect(await store.countUnread()).toEqual({ yips: 2, people: 2 });
	});

	it('marks everything read at once', async () => {
		await store.putYips([yip({ key: 'a' }), yip({ key: 'b' })]);
		await store.markAllRead();

		expect((await store.countUnread()).yips).toBe(0);
	});

	it('clears cached yips without touching the follow list', async () => {
		await store.follow(person(), [feed()]);
		await store.putYips([yip()]);

		await store.clearYips();

		expect(await store.listYips()).toEqual([]);
		expect(await store.listPeople()).toHaveLength(1);
	});
});

describe('the ring, peaks and settings', () => {
	it('keeps one ring record', async () => {
		expect(await store.readRing()).toBeNull();

		await store.writeRing({
			document: { version: '1.0', entries: [] },
			etag: 'W/"a"',
			fetchedAt: '2026-09-22T00:00:00.000Z'
		});
		await store.writeRing({
			document: { version: '1.1', entries: [] },
			fetchedAt: '2026-09-23T00:00:00.000Z'
		});

		expect((await store.readRing())?.document.version).toBe('1.1');
	});

	it('caches waveform peaks so a track is decoded at most once', async () => {
		await store.writePeaks({
			key: 'https://example.com/a.mp3::W/"v1"',
			peaks: [0.1, 0.9, 0.4],
			duration: 183,
			cachedAt: '2026-09-22T00:00:00.000Z'
		});

		expect((await store.readPeaks('https://example.com/a.mp3::W/"v1"'))?.duration).toBe(183);
		// A different ETag is a different file, and must not reuse the old shape.
		expect(await store.readPeaks('https://example.com/a.mp3::W/"v2"')).toBeNull();
	});

	it('round trips a setting', async () => {
		expect(await store.getSetting('includeExplicit')).toBeNull();
		await store.setSetting('includeExplicit', true);
		expect(await store.getSetting<boolean>('includeExplicit')).toBe(true);
	});
});
