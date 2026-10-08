import {
	COLLECTIONS,
	INDEXED,
	Serial,
	indexValues,
	ordered,
	type Collection,
	type IndexValue,
	type IndexedField,
	type RecordBackend,
	type RecordQuery,
	type RecordTx
} from './records.js';

/**
 * Records in IndexedDB with every value encrypted, for the web build, where there is no Keystore.
 *
 * Weaker than the phone's store, and documented as such: the keys are non-extractable WebCrypto
 * keys kept in the same database, so script on this origin can still use them. What it protects
 * against is the database files being read off a disk or out of a profile backup.
 *
 * Nothing is stored in the clear, not even record keys or the fields queries use, because those
 * are follows' addresses. A record's key is an HMAC of its real key; everything else, indexed
 * fields included, is inside one AES-GCM ciphertext. Queries therefore read and decrypt a whole
 * collection and filter in memory, which is fine for the web build and is why the phone uses
 * SQLCipher instead.
 *
 * An IndexedDB transaction closes itself while code awaits anything that is not IndexedDB, and
 * WebCrypto is async, so a `RecordTx` here reads through and keeps its writes in memory. On
 * commit it encrypts them, then applies them all in one IndexedDB transaction: all or nothing,
 * as `RecordTx` promises.
 */

const KEYS_STORE = 'keys';
/** Bumped whenever a collection is added; the upgrade creates any store that is missing. */
const VERSION = 6;

interface Sealed {
	/** HMAC-SHA-256 of the record's key, hex. */
	h: string;
	iv: Uint8Array;
	c: ArrayBuffer;
}

interface Plain {
	key: string;
	value: object;
	values: Record<string, IndexValue>;
}

interface Keys {
	seal: CryptoKey;
	name: CryptoKey;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});
}

function done(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('transaction failed'));
		transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
	});
}

const hex = (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export class EncryptedIdbBackend implements RecordBackend {
	private readonly serial = new Serial();
	private db: IDBDatabase | null = null;
	private keys: Keys | null = null;
	private opened: Promise<void> | null = null;

	constructor(private readonly name: string) {}

	open(): Promise<void> {
		this.opened ??= this.serial
			.run(async () => {
				this.db = await this.openDatabase();
				this.keys = await this.loadKeys(this.db);
			})
			.catch((cause: unknown) => {
				this.opened = null;
				throw cause;
			});
		return this.opened;
	}

	private openDatabase(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.name, VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				for (const name of [...COLLECTIONS, KEYS_STORE]) {
					if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'h' });
				}
			};
			request.onsuccess = () => {
				const db = request.result;
				db.onversionchange = () => db.close();
				resolve(db);
			};
			request.onerror = () => reject(request.error ?? new Error('could not open the database'));
		});
	}

	/** The two keys, made on first open. Non-extractable: no script can read their bytes. */
	private async loadKeys(db: IDBDatabase): Promise<Keys> {
		const read = db.transaction(KEYS_STORE, 'readonly');
		const saved = (await promisify(read.objectStore(KEYS_STORE).get('v1'))) as
			{ h: string; seal: CryptoKey; name: CryptoKey } | undefined;
		if (saved) return { seal: saved.seal, name: saved.name };

		const seal = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]);
		const name = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
			'sign'
		]);
		const write = db.transaction(KEYS_STORE, 'readwrite');
		write.objectStore(KEYS_STORE).put({ h: 'v1', seal, name });
		await done(write);
		return { seal, name };
	}

	transaction<T>(work: (tx: RecordTx) => Promise<T>): Promise<T> {
		return this.serial.run(async () => {
			if (!this.db || !this.keys) throw new Error('database is not open');
			const tx = new EncryptedTx(this.db, this.keys);
			const result = await work(tx);
			await tx.commit();
			return result;
		});
	}
}

type Pending = Map<string, Plain | null>;

class EncryptedTx implements RecordTx {
	private readonly pending = new Map<Collection, Pending>();
	private readonly cleared = new Set<Collection>();
	private readonly hashes = new Map<string, string>();

	constructor(
		private readonly db: IDBDatabase,
		private readonly keys: Keys
	) {}

	private async hash(key: string): Promise<string> {
		const known = this.hashes.get(key);
		if (known) return known;
		const signed = await crypto.subtle.sign('HMAC', this.keys.name, new TextEncoder().encode(key));
		const value = hex(signed);
		this.hashes.set(key, value);
		return value;
	}

	private async open(sealed: Sealed): Promise<Plain> {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: sealed.iv as Uint8Array<ArrayBuffer> },
			this.keys.seal,
			sealed.c
		);
		return JSON.parse(new TextDecoder().decode(plain)) as Plain;
	}

	private async seal(hash: string, plain: Plain): Promise<Sealed> {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const c = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			this.keys.seal,
			new TextEncoder().encode(JSON.stringify(plain))
		);
		return { h: hash, iv, c };
	}

	private pendingFor(collection: Collection): Pending {
		let map = this.pending.get(collection);
		if (!map) {
			map = new Map();
			this.pending.set(collection, map);
		}
		return map;
	}

	async get<T>(collection: Collection, key: string): Promise<T | undefined> {
		const pending = this.pending.get(collection);
		if (pending?.has(key)) return (pending.get(key)?.value as T | undefined) ?? undefined;
		if (this.cleared.has(collection)) return undefined;
		// Hashed before the transaction opens: it would close itself while WebCrypto works.
		const hash = await this.hash(key);
		const read = this.db.transaction(collection, 'readonly');
		const sealed = (await promisify(read.objectStore(collection).get(hash))) as Sealed | undefined;
		return sealed ? ((await this.open(sealed)).value as T) : undefined;
	}

	async put(collection: Collection, key: string, value: object): Promise<void> {
		// A copy, so a caller changing its object afterwards cannot change what gets written.
		const copy = JSON.parse(JSON.stringify(value)) as object;
		this.pendingFor(collection).set(key, {
			key,
			value: copy,
			values: indexValues(collection, copy)
		});
	}

	async delete(collection: Collection, key: string): Promise<void> {
		this.pendingFor(collection).set(key, null);
	}

	async clear(collection: Collection): Promise<void> {
		this.cleared.add(collection);
		this.pending.set(collection, new Map());
	}

	/** Every record in a collection as this transaction sees it: stored, then its own writes. */
	private async everything(collection: Collection): Promise<Plain[]> {
		const byKey = new Map<string, Plain>();
		if (!this.cleared.has(collection)) {
			const read = this.db.transaction(collection, 'readonly');
			const sealed = (await promisify(read.objectStore(collection).getAll())) as Sealed[];
			for (const plain of await Promise.all(sealed.map((row) => this.open(row)))) {
				byKey.set(plain.key, plain);
			}
		}
		for (const [key, plain] of this.pending.get(collection) ?? []) {
			if (plain) byKey.set(key, plain);
			else byKey.delete(key);
		}
		// Key order first, so ties under `orderBy` break the same way the SQL backend's do.
		return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	}

	async all<T, C extends Collection>(collection: C, query: RecordQuery<C> = {}): Promise<T[]> {
		const rows = ordered(await this.everything(collection), query);
		return rows.map((row) => row.value as T);
	}

	async fields<C extends Collection>(
		collection: C,
		query: RecordQuery<C> = {}
	): Promise<Array<Record<IndexedField<C> | 'key', IndexValue>>> {
		const fields = INDEXED[collection] as readonly string[];
		return ordered(await this.everything(collection), query).map((row) => {
			const out: Record<string, IndexValue> = { key: row.key };
			for (const field of fields) out[field] = row.values[field] ?? null;
			return out as Record<IndexedField<C> | 'key', IndexValue>;
		});
	}

	async commit(): Promise<void> {
		if (!this.pending.size && !this.cleared.size) return;
		// Everything async happens first; the IndexedDB transaction then only does synchronous puts.
		const writes: Array<{ collection: Collection; hash: string; sealed: Sealed | null }> = [];
		for (const [collection, pending] of this.pending) {
			for (const [key, plain] of pending) {
				const hash = await this.hash(key);
				writes.push({ collection, hash, sealed: plain ? await this.seal(hash, plain) : null });
			}
		}
		const names = [...new Set([...this.pending.keys(), ...this.cleared])];
		const transaction = this.db.transaction(names, 'readwrite');
		for (const collection of this.cleared) transaction.objectStore(collection).clear();
		for (const { collection, hash, sealed } of writes) {
			const store = transaction.objectStore(collection);
			if (sealed) store.put(sealed);
			else store.delete(hash);
		}
		await done(transaction);
	}
}
