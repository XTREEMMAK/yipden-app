import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { directCursor, stableYipId } from '@yipden/feeds';
import { DocStore } from './docStore.js';
import { EncryptedIdbBackend } from './encryptedIdbBackend.js';
import { IdbStore } from './idb.js';
import { LEGACY_DATABASE, migrateFromIdb, type MigrationHooks } from './migrate.js';
import type { RecordBackend } from './records.js';
import { rekeyAll, rekeyYip } from './rekey.js';
import { SqlBackend } from './sqlBackend.js';
import { sqljsDriver } from './testing/sqljs.js';
import { feed, person, shelfItem, yip } from './testing/fixtures.js';

const FEED = 'https://lena.example.com/feed.xml';

/** A yip exactly as the old store kept it: keyed by feed and entry id, with no `entryId`. */
function legacyYip(entry: string, overrides: Parameters<typeof yip>[0] = {}) {
	const record = yip({ key: `${FEED}::${entry}`, id: entry, ...overrides });
	delete record.entryId;
	return record;
}

async function legacyDatabase(): Promise<void> {
	const old = new IdbStore();
	await old.init();
	await old.follow(person(), [
		feed({ etag: 'W/"v1"', lastModified: 'Mon, 21 Sep 2026 00:00:00 GMT' })
	]);
	await old.putYips([
		legacyYip('tag:lena,2026:one'),
		legacyYip('https://lena.example.com/2', { publishedAt: '2026-09-21T10:00:00.000Z' })
	]);
	await old.markRead(`${FEED}::tag:lena,2026:one`);
	await old.saveToShelf(shelfItem());
	await old.setVerdict({
		id: 'wide.example.com',
		url: 'https://wide.example.com/',
		name: 'Wide',
		verdict: 'liked',
		source: 'indienodes',
		at: '2026-09-26T00:00:00.000Z'
	});
	await old.writeRing({ document: { version: '1.0', entries: [] }, fetchedAt: '2026-09-22' });
	await old.writePeaks({
		key: 'https://a.example/a.mp3',
		peaks: [0.5],
		duration: 3,
		cachedAt: 'x'
	});
	await old.setSetting('maxAgeDays', 30);
	await old.setSetting('ringQueue', {
		version: 2,
		currentIndex: 0,
		playedEntryIds: [],
		queue: [
			{ id: `${FEED}::https://lena.example.com/2`, title: 'Two' },
			{ id: 'https://ring.example/track.mp3', title: 'A ring track' }
		]
	});
	// Its connection stays open, as the app's would until the page goes; the delete must not hang.
}

async function legacyStillThere(): Promise<boolean> {
	return (await indexedDB.databases()).some((info) => info.name === LEGACY_DATABASE);
}

const backends: Array<[string, () => { make: () => RecordBackend }]> = [
	[
		'SQLite',
		() => {
			const file = {};
			return { make: () => new SqlBackend(sqljsDriver(file)) };
		}
	],
	['encrypted IndexedDB', () => ({ make: () => new EncryptedIdbBackend('yipden-sealed') })]
];

describe.each(backends)('moving into %s', (_name, setup) => {
	let make: () => RecordBackend;
	const open = (hooks?: MigrationHooks) =>
		new DocStore(make(), (backend) => migrateFromIdb(backend, hooks));

	beforeEach(() => {
		globalThis.indexedDB = new IDBFactory();
		make = setup().make;
	});

	it('copies everything, re-keys yips with their read state, and deletes the old database', async () => {
		await legacyDatabase();
		const store = open();
		await store.init();

		expect((await store.listPeople()).map((entry) => entry.id)).toEqual(['person-lena']);
		const [saved] = await store.listFeeds();
		expect(saved?.cursor).toBe(
			directCursor({ etag: 'W/"v1"', lastModified: 'Mon, 21 Sep 2026 00:00:00 GMT' })
		);
		expect(saved?.etag).toBeUndefined();

		const one = stableYipId(FEED, 'tag:lena,2026:one');
		const two = stableYipId(FEED, 'https://lena.example.com/2');
		const yips = await store.listAllYips();
		expect(yips.map((entry) => entry.key).sort()).toEqual([one, two].sort());
		const read = yips.find((entry) => entry.key === one);
		expect(read).toMatchObject({ id: one, entryId: 'tag:lena,2026:one', feedId: FEED });
		expect(read?.readAt).toBeTruthy();
		expect(yips.find((entry) => entry.key === two)?.readAt).toBeUndefined();
		expect(await store.countUnread()).toEqual({ yips: 1, people: 1 });

		expect(await store.listShelf()).toHaveLength(1);
		expect(await store.listVerdicts()).toHaveLength(1);
		expect((await store.readRing())?.document.version).toBe('1.0');
		expect((await store.readPeaks('https://a.example/a.mp3'))?.duration).toBe(3);
		expect(await store.getSetting('maxAgeDays')).toBe(30);
		const queue = await store.getSetting<{ queue: Array<{ id: string }> }>('ringQueue');
		expect(queue?.queue.map((item) => item.id)).toEqual([two, 'https://ring.example/track.mp3']);

		expect(await legacyStillThere()).toBe(false);
	});

	it('a refresh after the move matches the moved yips instead of adding them again', async () => {
		await legacyDatabase();
		const store = open();
		await store.init();
		const moved = (await store.listAllYips()).find(
			(entry) => entry.entryId === 'tag:lena,2026:one'
		)!;

		// What refresh now stores for that entry: keyed by its stable id.
		const { added } = await store.putYips([
			{ ...moved, key: moved.id, title: 'Edited', readAt: undefined } as never
		]);
		expect(added).toBe(0);
		expect(
			(await store.listAllYips()).find((entry) => entry.key === moved.id)?.readAt
		).toBeTruthy();
	});

	it('cut off before the copy is marked done, keeps the old database and copies again next time', async () => {
		await legacyDatabase();
		await expect(
			open({
				afterCopy: () => {
					throw new Error('the app was killed');
				}
			}).init()
		).rejects.toThrow('killed');
		expect(await legacyStillThere()).toBe(true);

		const store = open();
		await store.init();
		expect(await store.listAllYips()).toHaveLength(2);
		expect(await store.listPeople()).toHaveLength(1);
		expect(await legacyStillThere()).toBe(false);
	});

	it('cut off after the copy is marked done, only finishes deleting the old database', async () => {
		await legacyDatabase();
		await open().init();
		// The old database coming back stands for a launch that ended before deleting it.
		await legacyDatabase();
		expect(await legacyStillThere()).toBe(true);

		const store = open();
		await store.init();
		expect(await legacyStillThere()).toBe(false);
		// Copied once, not twice, and the copy was not redone from the reappeared database.
		expect(await store.listAllYips()).toHaveLength(2);
	});

	it('on a first install there is nothing to move and no old database is created', async () => {
		const store = open();
		await store.init();
		expect(await store.listPeople()).toEqual([]);
		expect(await legacyStillThere()).toBe(false);
	});
});

describe('re-keying', () => {
	it('leaves a yip already on its stable id as it is', () => {
		const current = yip({
			entryId: 'e1',
			id: stableYipId(FEED, 'e1'),
			key: stableYipId(FEED, 'e1')
		});
		expect(rekeyYip(current)).toEqual(current);
	});

	it('takes the feed from the key when a record predates feedId', () => {
		const old = legacyYip('e2');
		delete old.feedId;
		expect(rekeyYip(old)).toMatchObject({
			feedId: FEED,
			entryId: 'e2',
			key: stableYipId(FEED, 'e2')
		});
	});

	it('merges two old records that become one, keeping it read and keeping when it was first seen', () => {
		const first = legacyYip('same', { seenAt: '2026-09-02T00:00:00.000Z' });
		const second = {
			...legacyYip('same', {
				seenAt: '2026-09-01T00:00:00.000Z',
				readAt: '2026-09-03T00:00:00.000Z'
			}),
			key: `https://lena.example.com/old-feed.xml::same`,
			feedId: 'https://lena.example.com/old-feed.xml'
		};
		const { yips, keys } = rekeyAll([first, second]);
		expect(yips).toHaveLength(1);
		expect(yips[0]).toMatchObject({
			seenAt: '2026-09-01T00:00:00.000Z',
			readAt: '2026-09-03T00:00:00.000Z'
		});
		expect(keys.get(first.key)).toBe(keys.get(second.key));
	});
});
