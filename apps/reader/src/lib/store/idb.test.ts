import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStore } from './idb.js';
import { person, shelfItem, yip } from './testing/fixtures.js';

/** What only the retiring IndexedDB store does; everything shared is in `contract.test.ts`. */

let store: IdbStore;

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	store = new IdbStore();
	await store.init();
});

describe('records from before feedId', () => {
	it('matches legacy cached items that predate feedId', async () => {
		const legacy = yip({
			key: 'https://lena.example.com/feed.xml::legacy',
			id: 'legacy'
		});
		delete legacy.feedId;
		await store.putYips([legacy]);

		expect(await store.listYips({ feedIds: ['https://lena.example.com/feed.xml'] })).toHaveLength(
			1
		);
	});
});

describe('upgrading from database version 1', () => {
	it('adds the shelf and leaves everything already there where it was', async () => {
		globalThis.indexedDB = new IDBFactory();
		// A database exactly as version 1 created it, holding one follow.
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('yipden', 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore('people', { keyPath: 'id' }).createIndex('siteUrl', 'siteUrl');
				db.createObjectStore('feeds', { keyPath: 'id' }).createIndex('personId', 'personId');
				const yips = db.createObjectStore('yips', { keyPath: 'key' });
				yips.createIndex('publishedAt', 'publishedAt');
				yips.createIndex('category', 'category');
				yips.createIndex('personId', 'personId');
				for (const name of ['ring', 'peaks', 'settings'])
					db.createObjectStore(name, { keyPath: 'key' });
				request.transaction!.objectStore('people').put(person());
			};
			request.onsuccess = () => {
				request.result.close();
				resolve();
			};
			request.onerror = () => reject(request.error);
		});

		const upgraded = new IdbStore();
		await upgraded.init();
		expect((await upgraded.listPeople()).map((entry) => entry.id)).toEqual(['person-lena']);
		expect(await upgraded.listShelf()).toEqual([]);
		await upgraded.saveToShelf(shelfItem());
		expect(await upgraded.listShelf()).toHaveLength(1);
	});
});
