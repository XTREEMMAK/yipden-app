import { directCursor } from '@yipden/feeds';
import type { RingQueueRecord } from '../ringPlayer.svelte.js';
import type { Collection, RecordBackend, RecordTx } from './records.js';
import { referencesFromTracks } from '../references/fromTracks.js';
import { rekeyAll } from './rekey.js';
import type { Feed, StoredYip } from './types.js';

/**
 * The one-time move from the plaintext IndexedDB store into the encrypted one.
 *
 * 1. Copy everything, re-keying yips to their stable ids and turning old feed validators into
 *    cursors, in one transaction.
 * 2. Read the copy back and check it: the same number of records in every collection, and
 *    exactly the yip keys expected.
 * 3. Only then write the marker that says the copy is complete.
 * 4. Only after the marker, delete the old database.
 *
 * Cut off anywhere, the next launch picks up safely. Before the marker, the copy is discarded
 * and made again from the old database, which is still whole. After it, only the deletion is
 * left to finish. The old database is never deleted unless a checked copy exists.
 */

export const LEGACY_DATABASE = 'yipden';
const MARKER = 'migratedFromIdb';

/** The old database's object stores, in the shape `IdbStore` wrote them. */
const LEGACY_STORES = [
	'people',
	'feeds',
	'yips',
	'ring',
	'peaks',
	'settings',
	'shelf',
	'verdicts'
] as const;

type LegacyDump = Partial<Record<(typeof LEGACY_STORES)[number], unknown[]>>;

export interface MigrationHooks {
	/** Tests only: runs between the copy and its marker, to stand for the app being killed. */
	afterCopy?: () => Promise<void> | void;
}

async function legacyExists(): Promise<boolean> {
	if (typeof indexedDB === 'undefined') return false;
	if (typeof indexedDB.databases === 'function') {
		return (await indexedDB.databases()).some((info) => info.name === LEGACY_DATABASE);
	}
	// No `databases()`: open it without a version and back out if that would create it.
	return new Promise((resolve) => {
		const request = indexedDB.open(LEGACY_DATABASE);
		let created = false;
		request.onupgradeneeded = (event) => {
			if (event.oldVersion === 0) {
				created = true;
				request.transaction?.abort();
			}
		};
		request.onsuccess = () => {
			request.result.close();
			resolve(!created);
		};
		request.onerror = () => resolve(false);
	});
}

function readLegacy(): Promise<LegacyDump> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(LEGACY_DATABASE);
		request.onerror = () => reject(request.error ?? new Error('could not open the old database'));
		request.onsuccess = () => {
			const db = request.result;
			const present = LEGACY_STORES.filter((name) => db.objectStoreNames.contains(name));
			if (!present.length) {
				db.close();
				resolve({});
				return;
			}
			const transaction = db.transaction(present, 'readonly');
			const dump: LegacyDump = {};
			for (const name of present) {
				const all = transaction.objectStore(name).getAll();
				all.onsuccess = () => {
					dump[name] = all.result as unknown[];
				};
			}
			transaction.oncomplete = () => {
				db.close();
				resolve(dump);
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error ?? new Error('could not read the old database'));
			};
		};
	});
}

function deleteLegacy(): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(LEGACY_DATABASE);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('could not delete the old database'));
		// Another connection holding it open: it closes on `versionchange`, and the delete finishes.
		request.onblocked = () => undefined;
	});
}

/** A feed record with its old validators turned into the cursor `refresh.ts` now keeps. */
function withCursor(feed: Feed): Feed {
	const next: Feed = { ...feed };
	const cursor =
		feed.cursor ??
		directCursor({
			...(feed.etag ? { etag: feed.etag } : {}),
			...(feed.lastModified ? { lastModified: feed.lastModified } : {})
		});
	delete next.etag;
	delete next.lastModified;
	return cursor ? { ...next, cursor } : next;
}

/** The player's saved queue, with yip ids moved to the new keys. Ring tracks are untouched. */
function remapQueue(value: unknown, keys: Map<string, string>): unknown {
	const record = value as RingQueueRecord | null;
	if (!record || !Array.isArray(record.queue)) return value;
	return {
		...record,
		queue: record.queue.map((item) =>
			item && typeof item.id === 'string' && keys.has(item.id)
				? { ...item, id: keys.get(item.id) }
				: item
		)
	};
}

interface Planned {
	collection: Collection;
	key: string;
	value: object;
}

function plan(dump: LegacyDump): Planned[] {
	const rows: Planned[] = [];
	const list = <T>(name: (typeof LEGACY_STORES)[number]) => (dump[name] ?? []) as T[];

	for (const person of list<{ id: string }>('people')) {
		rows.push({ collection: 'people', key: person.id, value: person });
	}
	for (const feed of list<Feed>('feeds')) {
		rows.push({ collection: 'feeds', key: feed.id, value: withCursor(feed) });
	}
	const { yips, keys } = rekeyAll(list<StoredYip>('yips'));
	for (const yip of yips) rows.push({ collection: 'yips', key: yip.key, value: yip });
	for (const row of list<{ key: string; value: object }>('ring')) {
		if (row.key === 'current' && row.value) {
			rows.push({ collection: 'ring', key: 'current', value: row.value });
		}
	}
	for (const peaks of list<{ key: string }>('peaks')) {
		rows.push({ collection: 'peaks', key: peaks.key, value: peaks });
	}
	for (const setting of list<{ key: string; value: unknown }>('settings')) {
		const value = setting.key === 'ringQueue' ? remapQueue(setting.value, keys) : setting.value;
		rows.push({ collection: 'settings', key: setting.key, value: { value } });
	}
	for (const item of list<{ id: string }>('shelf')) {
		rows.push({ collection: 'shelf', key: item.id, value: item });
	}
	for (const verdict of list<{ id: string }>('verdicts')) {
		rows.push({ collection: 'verdicts', key: verdict.id, value: verdict });
	}
	return rows;
}

const COPIED: Collection[] = [
	'people',
	'feeds',
	'yips',
	'ring',
	'peaks',
	'settings',
	'shelf',
	'verdicts'
];

async function verify(tx: RecordTx, rows: Planned[]): Promise<void> {
	for (const collection of COPIED) {
		const expected = new Set(
			rows.filter((row) => row.collection === collection).map((row) => row.key)
		);
		const actual = (await tx.fields(collection)).map((row) => row.key as string);
		if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
			throw new Error(`the copied ${collection} do not match the old database`);
		}
	}
}

/** Run before anything else touches the new store. Does nothing once the move has happened. */
export async function migrateFromIdb(
	backend: RecordBackend,
	hooks: MigrationHooks = {}
): Promise<void> {
	const marker = await backend.transaction((tx) => tx.get('meta', MARKER));
	const hasLegacy = await legacyExists();

	if (marker) {
		// Copied and checked on an earlier launch that ended before the old database was gone.
		if (hasLegacy) await deleteLegacy();
		return;
	}
	if (!hasLegacy) {
		// A first install: nothing to move. The marker saves asking again on every launch.
		await backend.transaction((tx) =>
			tx.put('meta', MARKER, { at: new Date().toISOString(), copied: 0 })
		);
		return;
	}

	const rows = plan(await readLegacy());

	await backend.transaction(async (tx) => {
		// Whatever an interrupted earlier attempt left is discarded and copied again.
		for (const collection of COPIED) await tx.clear(collection);
		for (const row of rows) await tx.put(row.collection, row.key, row.value);
	});
	await backend.transaction((tx) => verify(tx, rows));
	await hooks.afterCopy?.();
	await backend.transaction((tx) =>
		tx.put('meta', MARKER, { at: new Date().toISOString(), copied: rows.length })
	);
	await deleteLegacy();
}

/**
 * Reader tracks kept as a setting become audio references, once. Runs after the move from the
 * old database (which copies the setting as it was) and on stores that moved before references
 * existed. The setting is removed in the same transaction, so this never runs twice.
 */
export async function migrateReaderTracks(backend: RecordBackend): Promise<void> {
	await backend.transaction(async (tx) => {
		const setting = await tx.get<{ value: unknown }>('settings', 'readerTracks');
		if (!setting) return;
		for (const reference of referencesFromTracks(setting.value)) {
			if (!(await tx.get('references', reference.id))) {
				await tx.put('references', reference.id, reference);
			}
		}
		await tx.delete('settings', 'readerTracks');
	});
}

/** Everything a store runs before its first use, in order. */
export async function prepareStore(backend: RecordBackend): Promise<void> {
	await migrateFromIdb(backend);
	await migrateReaderTracks(backend);
}
