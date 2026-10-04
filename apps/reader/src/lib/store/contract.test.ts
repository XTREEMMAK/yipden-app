import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DocStore } from './docStore.js';
import { EncryptedIdbBackend } from './encryptedIdbBackend.js';
import { IdbStore } from './idb.js';
import { SqlBackend } from './sqlBackend.js';
import { sqljsDriver } from './testing/sqljs.js';
import { feed, person, shelfItem, yip } from './testing/fixtures.js';
import type { Store } from './types.js';

/**
 * What every `Store` must do, run against each one: the IndexedDB store being retired, and the
 * two encrypted ones replacing it (SQLite as on the phone, and encrypted IndexedDB as on the
 * web). A behaviour the old store had and a new one lacks fails here, not on a reader's phone.
 */
const implementations: Array<[string, () => Store]> = [
	['IdbStore', () => new IdbStore()],
	['DocStore over SQLite', () => new DocStore(new SqlBackend(sqljsDriver()))],
	['DocStore over encrypted IndexedDB', () => new DocStore(new EncryptedIdbBackend('yipden-test'))]
];

describe.each(implementations)('%s', (_name, make) => {
	let store: Store;

	beforeEach(async () => {
		// A fresh database per test, so nothing leaks between them.
		globalThis.indexedDB = new IDBFactory();
		store = make();
		await store.init();
	});

	describe('following', () => {
		it('stores a person and their feeds together', async () => {
			await store.follow(person(), [
				feed(),
				feed({ id: 'https://bsky.app/x/rss', kind: 'bluesky' })
			]);

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
			await store.follow(
				person({ id: 'person-sam', name: 'Sam', siteUrl: 'https://sam.example/' }),
				[feed({ id: 'https://sam.example/feed', personId: 'person-sam' })]
			);

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

		it('filters cached items by enabled feed without deleting the other records', async () => {
			await store.putYips([
				yip({ key: 'site', feedId: 'site-feed', sourceFeedId: 'site-feed' }),
				yip({ key: 'social', feedId: 'social-feed', sourceFeedId: 'social-feed' })
			]);

			expect((await store.listYips({ feedIds: ['site-feed'] })).map((item) => item.key)).toEqual([
				'site'
			]);
			expect(await store.listYips()).toHaveLength(2);
			expect(await store.listYips({ feedIds: [] })).toEqual([]);
		});

		it('pages with a cursor', async () => {
			await store.putYips([
				yip({ key: 'a', publishedAt: '2026-09-03T00:00:00.000Z' }),
				yip({ key: 'b', publishedAt: '2026-09-02T00:00:00.000Z' }),
				yip({ key: 'c', publishedAt: '2026-09-01T00:00:00.000Z' })
			]);

			const first = await store.listYips({ limit: 2 });
			expect(first.map((item) => item.key)).toEqual(['a', 'b']);

			const cursor = first[1]?.publishedAt;
			const next = await store.listYips({ ...(cursor ? { before: cursor } : {}), limit: 2 });
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

		it('marks a cross-post group read atomically', async () => {
			await store.putYips([yip({ key: 'site' }), yip({ key: 'social', id: '2' })]);
			await store.markRead(['site', 'social', 'site']);

			expect((await store.listYips()).every((item) => Boolean(item.readAt))).toBe(true);
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

	describe('source management', () => {
		it('attaches a manual source without replacing an existing feed', async () => {
			await store.follow(person(), [feed()]);
			const manual = feed({
				id: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
				url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
				kind: 'youtube',
				provenance: 'manual',
				verified: false
			});

			expect(await store.addFeed(manual)).toEqual({ status: 'added' });
			expect(await store.addFeed({ ...manual, title: 'replacement' })).toEqual({
				status: 'already-attached'
			});
			expect(
				(await store.listFeeds('person-lena')).find((item) => item.id === manual.id)?.title
			).toBe('Lena');
		});

		it('does not move a globally identified feed between people', async () => {
			await store.follow(person(), [feed()]);
			const shared = feed({
				id: 'https://shared.example/feed.xml',
				url: 'https://shared.example/feed.xml'
			});
			await store.addFeed(shared);

			expect(await store.addFeed({ ...shared, personId: 'person-sam' })).toEqual({
				status: 'belongs-to-other',
				personId: 'person-lena'
			});
		});

		it('removes only that source and its cached yips', async () => {
			await store.follow(person(), [
				feed(),
				feed({ id: 'social-feed', url: 'https://social.example/feed' })
			]);
			await store.putYips([
				yip(),
				yip({ key: 'social-feed::2', feedId: 'social-feed', sourceFeedId: 'social-feed', id: '2' })
			]);

			await store.removeFeed('person-lena', 'social-feed');

			expect((await store.listFeeds('person-lena')).map((item) => item.id)).toEqual([
				'https://lena.example.com/feed.xml'
			]);
			expect((await store.listYips()).map((item) => item.id)).toEqual(['1']);
		});
	});

	describe('the shelf', () => {
		it('lists newest first', async () => {
			await store.saveToShelf(
				shelfItem({
					id: 'https://a.example.com/',
					url: 'https://a.example.com/',
					savedAt: '2026-09-25T00:00:00.000Z'
				})
			);
			await store.saveToShelf(
				shelfItem({
					id: 'https://b.example.com/',
					url: 'https://b.example.com/',
					savedAt: '2026-09-27T00:00:00.000Z'
				})
			);

			expect((await store.listShelf()).map((item) => item.id)).toEqual([
				'https://b.example.com/',
				'https://a.example.com/'
			]);
		});

		it('keeps the first save when the same address is saved again', async () => {
			await store.saveToShelf(shelfItem());
			await store.saveToShelf(shelfItem({ savedAt: '2026-09-28T00:00:00.000Z', title: 'Changed' }));

			const items = await store.listShelf();
			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({
				savedAt: '2026-09-26T10:00:00.000Z',
				title: 'A wide essay'
			});
		});

		it('removes only the item asked for, and unfollowing never touches it', async () => {
			await store.follow(person(), [feed()]);
			await store.saveToShelf(shelfItem());
			await store.saveToShelf(
				shelfItem({ id: 'https://b.example.com/', url: 'https://b.example.com/' })
			);

			await store.unfollow('person-lena');
			expect(await store.listShelf()).toHaveLength(2);

			await store.removeFromShelf('https://wide.example.com/essay');
			expect((await store.listShelf()).map((item) => item.id)).toEqual(['https://b.example.com/']);
		});

		it('clearing cached yips leaves the shelf alone', async () => {
			await store.saveToShelf(shelfItem());
			await store.clearYips();
			expect(await store.listShelf()).toHaveLength(1);
		});
	});
});
