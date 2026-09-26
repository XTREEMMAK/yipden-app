import type { RingCacheRecord } from '@yipden/ring-client';
import type {
	AddFeedResult,
	Feed,
	PeaksRecord,
	Person,
	SettingKey,
	Store,
	StoredYip,
	YipQuery
} from './types.js';

/**
 * The one on device implementation of `Store`, over IndexedDB.
 *
 * IndexedDB rather than SQLite, deliberately: it works identically in the Android WebView and
 * in a browser, so the same code path is exercised in development and on the device, and it
 * needs no native plugin. See DECISIONS.md.
 *
 * Written against the raw IDB API rather than a wrapper library, because the surface used here
 * is small and a dependency that sits between the app and its own data is a dependency that has
 * to be trusted with all of it.
 */

const DB_NAME = 'yipden';
const DB_VERSION = 1;

const STORE = {
	people: 'people',
	feeds: 'feeds',
	yips: 'yips',
	ring: 'ring',
	peaks: 'peaks',
	settings: 'settings'
} as const;

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

export class IdbStore implements Store {
	private database: IDBDatabase | null = null;
	private opening: Promise<IDBDatabase> | null = null;

	async init(): Promise<void> {
		await this.open();
	}

	private open(): Promise<IDBDatabase> {
		if (this.database) return Promise.resolve(this.database);
		if (this.opening) return this.opening;

		this.opening = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;

				if (!db.objectStoreNames.contains(STORE.people)) {
					const people = db.createObjectStore(STORE.people, { keyPath: 'id' });
					people.createIndex('siteUrl', 'siteUrl', { unique: false });
				}
				if (!db.objectStoreNames.contains(STORE.feeds)) {
					const feeds = db.createObjectStore(STORE.feeds, { keyPath: 'id' });
					feeds.createIndex('personId', 'personId', { unique: false });
				}
				if (!db.objectStoreNames.contains(STORE.yips)) {
					const yips = db.createObjectStore(STORE.yips, { keyPath: 'key' });
					// Feeds reads newest first, so the sort is an index rather than a sort.
					yips.createIndex('publishedAt', 'publishedAt', { unique: false });
					yips.createIndex('category', 'category', { unique: false });
					yips.createIndex('personId', 'personId', { unique: false });
				}
				for (const name of [STORE.ring, STORE.peaks, STORE.settings]) {
					if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'key' });
				}
			};

			request.onsuccess = () => {
				this.database = request.result;
				// Another tab upgrading the schema must not be blocked by this connection.
				this.database.onversionchange = () => {
					this.database?.close();
					this.database = null;
					this.opening = null;
				};
				resolve(request.result);
			};
			request.onerror = () => reject(request.error ?? new Error('could not open the database'));
		});

		return this.opening;
	}

	private async transaction(names: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
		const db = await this.open();
		return db.transaction(names, mode);
	}

	// ---------- people and feeds ----------

	async listPeople(): Promise<Person[]> {
		const transaction = await this.transaction([STORE.people], 'readonly');
		const people = await promisify(transaction.objectStore(STORE.people).getAll());
		return people.sort((a: Person, b: Person) => a.name.localeCompare(b.name));
	}

	async listFeeds(personId?: string): Promise<Feed[]> {
		const transaction = await this.transaction([STORE.feeds], 'readonly');
		const store = transaction.objectStore(STORE.feeds);
		if (personId === undefined) return promisify(store.getAll());
		return promisify(store.index('personId').getAll(personId));
	}

	/** One transaction, so a reader never ends up following a person with no feeds. */
	async follow(person: Person, feeds: Feed[]): Promise<void> {
		const transaction = await this.transaction([STORE.people, STORE.feeds], 'readwrite');
		transaction.objectStore(STORE.people).put(person);
		const store = transaction.objectStore(STORE.feeds);
		for (const feed of feeds) store.put(feed);
		return done(transaction);
	}

	async addFeed(feed: Feed): Promise<AddFeedResult> {
		const transaction = await this.transaction([STORE.feeds], 'readwrite');
		const feeds = transaction.objectStore(STORE.feeds);
		const existing = (await promisify(feeds.get(feed.id))) as Feed | undefined;

		if (existing) {
			await done(transaction);
			return existing.personId === feed.personId
				? { status: 'already-attached' }
				: { status: 'belongs-to-other', personId: existing.personId };
		}

		feeds.add(feed);
		await done(transaction);
		return { status: 'added' };
	}

	async removeFeed(personId: string, feedId: string): Promise<void> {
		const transaction = await this.transaction([STORE.feeds, STORE.yips], 'readwrite');
		const feeds = transaction.objectStore(STORE.feeds);
		const existing = (await promisify(feeds.get(feedId))) as Feed | undefined;
		if (!existing || existing.personId !== personId) return done(transaction);

		feeds.delete(feedId);
		const yips = transaction.objectStore(STORE.yips);
		for (const yip of (await promisify(yips.index('personId').getAll(personId))) as StoredYip[]) {
			if (yip.feedId === feedId || yip.key.startsWith(`${feedId}::`)) yips.delete(yip.key);
		}
		return done(transaction);
	}

	async unfollow(personId: string): Promise<void> {
		const transaction = await this.transaction(
			[STORE.people, STORE.feeds, STORE.yips],
			'readwrite'
		);
		transaction.objectStore(STORE.people).delete(personId);

		const feeds = transaction.objectStore(STORE.feeds);
		for (const key of await promisify(feeds.index('personId').getAllKeys(personId))) {
			feeds.delete(key);
		}

		const yips = transaction.objectStore(STORE.yips);
		for (const key of await promisify(yips.index('personId').getAllKeys(personId))) {
			yips.delete(key);
		}

		return done(transaction);
	}

	async isFollowing(siteUrl: string): Promise<boolean> {
		const transaction = await this.transaction([STORE.people], 'readonly');
		const match = await promisify(
			transaction.objectStore(STORE.people).index('siteUrl').getKey(siteUrl)
		);
		return match !== undefined;
	}

	async updateFeed(feed: Feed): Promise<void> {
		const transaction = await this.transaction([STORE.feeds], 'readwrite');
		transaction.objectStore(STORE.feeds).put(feed);
		return done(transaction);
	}

	// ---------- yips ----------

	/**
	 * Store yips, keeping what the reader has already done with the ones already here.
	 *
	 * A feed that republishes an item with a new summary must not resurrect it as unread. The
	 * existing `readAt` and `seenAt` win over whatever the feed says.
	 */
	async putYips(incoming: StoredYip[]): Promise<{ added: number }> {
		if (!incoming.length) return { added: 0 };

		const transaction = await this.transaction([STORE.yips], 'readwrite');
		const store = transaction.objectStore(STORE.yips);
		let added = 0;

		for (const yip of incoming) {
			const existing = (await promisify(store.get(yip.key))) as StoredYip | undefined;
			if (existing) {
				store.put({
					...yip,
					seenAt: existing.seenAt,
					...(existing.readAt ? { readAt: existing.readAt } : {})
				});
			} else {
				added += 1;
				store.put(yip);
			}
		}

		await done(transaction);
		return { added };
	}

	async listYips(query: YipQuery = {}): Promise<StoredYip[]> {
		const { filter = 'everything', feedIds, limit = 100, before } = query;
		if (feedIds?.length === 0) return [];
		const transaction = await this.transaction([STORE.yips], 'readonly');
		const index = transaction.objectStore(STORE.yips).index('publishedAt');
		const allowedFeeds = feedIds ? new Set(feedIds) : null;
		const legacyFeedPrefixes = feedIds?.map((feedId) => `${feedId}::`) ?? [];

		const results: StoredYip[] = [];
		// Newest first, walking the index backwards rather than reading everything and sorting.
		const range = before ? IDBKeyRange.upperBound(before, true) : null;
		const cursorRequest = index.openCursor(range, 'prev');

		await new Promise<void>((resolve, reject) => {
			cursorRequest.onsuccess = () => {
				const cursor = cursorRequest.result;
				if (!cursor || results.length >= limit) return resolve();
				const yip = cursor.value as StoredYip;
				const inEnabledFeed =
					allowedFeeds === null ||
					(yip.feedId
						? allowedFeeds.has(yip.feedId)
						: allowedFeeds.has(yip.sourceFeedId) ||
							legacyFeedPrefixes.some((prefix) => yip.key.startsWith(prefix)));
				if (inEnabledFeed && (filter === 'everything' || yip.category === filter)) {
					results.push(yip);
				}
				cursor.continue();
			};
			cursorRequest.onerror = () => reject(cursorRequest.error);
		});

		return results;
	}

	async listAllYips(): Promise<StoredYip[]> {
		const transaction = await this.transaction([STORE.yips], 'readonly');
		return promisify(transaction.objectStore(STORE.yips).getAll());
	}

	async countUnread(): Promise<{ yips: number; people: number }> {
		const transaction = await this.transaction([STORE.yips], 'readonly');
		const all = (await promisify(transaction.objectStore(STORE.yips).getAll())) as StoredYip[];
		const unread = all.filter((yip) => !yip.readAt);
		return { yips: unread.length, people: new Set(unread.map((yip) => yip.personId)).size };
	}

	async markRead(keys: string | string[]): Promise<void> {
		const transaction = await this.transaction([STORE.yips], 'readwrite');
		const store = transaction.objectStore(STORE.yips);
		const now = new Date().toISOString();
		for (const key of typeof keys === 'string' ? [keys] : [...new Set(keys)]) {
			const yip = (await promisify(store.get(key))) as StoredYip | undefined;
			if (yip && !yip.readAt) store.put({ ...yip, readAt: now });
		}
		return done(transaction);
	}

	async markAllRead(): Promise<void> {
		const transaction = await this.transaction([STORE.yips], 'readwrite');
		const store = transaction.objectStore(STORE.yips);
		const now = new Date().toISOString();
		for (const yip of (await promisify(store.getAll())) as StoredYip[]) {
			if (!yip.readAt) store.put({ ...yip, readAt: now });
		}
		return done(transaction);
	}

	async clearYips(): Promise<void> {
		const transaction = await this.transaction([STORE.yips], 'readwrite');
		transaction.objectStore(STORE.yips).clear();
		return done(transaction);
	}

	// ---------- ring, peaks and settings ----------

	async readRing(): Promise<RingCacheRecord | null> {
		const transaction = await this.transaction([STORE.ring], 'readonly');
		const record = await promisify(transaction.objectStore(STORE.ring).get('current'));
		return (record as { value: RingCacheRecord } | undefined)?.value ?? null;
	}

	async writeRing(record: RingCacheRecord): Promise<void> {
		const transaction = await this.transaction([STORE.ring], 'readwrite');
		transaction.objectStore(STORE.ring).put({ key: 'current', value: record });
		return done(transaction);
	}

	async readPeaks(key: string): Promise<PeaksRecord | null> {
		const transaction = await this.transaction([STORE.peaks], 'readonly');
		return (await promisify(transaction.objectStore(STORE.peaks).get(key))) ?? null;
	}

	async writePeaks(record: PeaksRecord): Promise<void> {
		const transaction = await this.transaction([STORE.peaks], 'readwrite');
		transaction.objectStore(STORE.peaks).put(record);
		return done(transaction);
	}

	async getSetting<T>(key: SettingKey): Promise<T | null> {
		const transaction = await this.transaction([STORE.settings], 'readonly');
		const record = await promisify(transaction.objectStore(STORE.settings).get(key));
		return (record as { value: T } | undefined)?.value ?? null;
	}

	async setSetting<T>(key: SettingKey, value: T): Promise<void> {
		const transaction = await this.transaction([STORE.settings], 'readwrite');
		transaction.objectStore(STORE.settings).put({ key, value });
		return done(transaction);
	}
}
