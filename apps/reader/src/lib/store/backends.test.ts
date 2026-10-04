import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DocStore } from './docStore.js';
import { EncryptedIdbBackend } from './encryptedIdbBackend.js';
import type { RecordBackend } from './records.js';
import { SqlBackend } from './sqlBackend.js';
import { sqljsDriver } from './testing/sqljs.js';
import { feed, person } from './testing/fixtures.js';

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

const backends: Array<[string, () => RecordBackend]> = [
	['SQLite', () => new SqlBackend(sqljsDriver())],
	['encrypted IndexedDB', () => new EncryptedIdbBackend('yipden-sealed')]
];

describe.each(backends)('%s', (_name, make) => {
	it('writes nothing from a transaction that fails partway', async () => {
		const backend = make();
		await backend.open();
		await expect(
			backend.transaction(async (tx) => {
				await tx.put('people', 'a', { id: 'a' });
				throw new Error('halfway');
			})
		).rejects.toThrow('halfway');
		expect(await backend.transaction((tx) => tx.all('people'))).toEqual([]);
	});

	it('sees its own writes inside a transaction', async () => {
		const backend = make();
		await backend.open();
		const seen = await backend.transaction(async (tx) => {
			await tx.put('feeds', 'f', { id: 'f', personId: 'p' });
			return tx.fields('feeds', { eq: { personId: 'p' } });
		});
		expect(seen).toEqual([{ key: 'f', personId: 'p' }]);
	});
});

describe('SQLite', () => {
	it('keeps everything across a close and reopen of the same file', async () => {
		const file = {};
		const first = new DocStore(new SqlBackend(sqljsDriver(file)));
		await first.follow(person(), [feed()]);

		const again = new DocStore(new SqlBackend(sqljsDriver(file)));
		expect((await again.listPeople()).map((entry) => entry.id)).toEqual(['person-lena']);
	});
});

describe('encrypted IndexedDB', () => {
	it('stores no follow, address or name in the clear, not even as a record key', async () => {
		const store = new DocStore(new EncryptedIdbBackend('yipden-sealed'));
		await store.follow(person(), [feed()]);

		const raw = await new Promise<unknown[]>((resolve, reject) => {
			const request = indexedDB.open('yipden-sealed');
			request.onsuccess = () => {
				const db = request.result;
				const names = [...db.objectStoreNames].filter((name) => name !== 'keys');
				const transaction = db.transaction(names, 'readonly');
				const rows: unknown[] = [];
				for (const name of names) {
					const all = transaction.objectStore(name).getAll();
					all.onsuccess = () => rows.push(...all.result);
				}
				transaction.oncomplete = () => resolve(rows);
			};
			request.onerror = () => reject(request.error);
		});

		expect(raw.length).toBeGreaterThan(0);
		const visible = JSON.stringify(raw, (_key, value: unknown) =>
			value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? '[bytes]' : value
		);
		for (const secret of ['lena', 'Lena', 'person-lena', 'feed.xml']) {
			expect(visible).not.toContain(secret);
		}
	});
});
