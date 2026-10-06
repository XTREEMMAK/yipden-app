import type { RingCacheRecord } from '@yipden/ring-client';
import type { Reference } from '../references/types.js';
import type { RecordBackend } from './records.js';
import type {
	AddFeedResult,
	Feed,
	ForumFollow,
	ForumTopicRecord,
	PeaksRecord,
	Person,
	ReferenceCheck,
	SettingKey,
	ShelfItem,
	StoredYip,
	Store,
	VerdictRecord,
	CreatorRecord,
	PlaceRecord,
	YipQuery
} from './types.js';

/**
 * The `Store`, written once over a `RecordBackend`.
 *
 * Every rule a reader's data follows lives here: what following and unfollowing touch, that a
 * refetched yip keeps its read state, that saving to the shelf twice keeps the first save. The
 * backend only keeps records, so the SQLCipher store on the phone and the encrypted IndexedDB one
 * on the web cannot disagree about any of it. Each method is one transaction.
 *
 * Yips here are keyed by their stable id (see `rekey.ts`), and every one has a `feedId`, so none
 * of the fallbacks `IdbStore` kept for records from before those existed are needed.
 */
export class DocStore implements Store {
	private opening: Promise<void> | null = null;

	constructor(
		private readonly backend: RecordBackend,
		/** Runs once, after the backend opens and before anything else: the move from `IdbStore`. */
		private readonly onOpen?: (backend: RecordBackend) => Promise<void>
	) {}

	init(): Promise<void> {
		this.opening ??= (async () => {
			await this.backend.open();
			await this.onOpen?.(this.backend);
		})().catch((cause: unknown) => {
			this.opening = null;
			throw cause;
		});
		return this.opening;
	}

	private async tx<T>(work: Parameters<RecordBackend['transaction']>[0]): Promise<T> {
		await this.init();
		return this.backend.transaction(work) as Promise<T>;
	}

	// ---------- people and feeds ----------

	async listPeople(): Promise<Person[]> {
		const people = await this.tx<Person[]>((tx) => tx.all<Person, 'people'>('people'));
		return people.sort((a, b) => a.name.localeCompare(b.name));
	}

	listFeeds(personId?: string): Promise<Feed[]> {
		return this.tx((tx) =>
			tx.all<Feed, 'feeds'>('feeds', personId === undefined ? {} : { eq: { personId } })
		);
	}

	follow(person: Person, feeds: Feed[]): Promise<void> {
		return this.tx(async (tx) => {
			await tx.put('people', person.id, person);
			for (const feed of feeds) await tx.put('feeds', feed.id, feed);
		});
	}

	addFeed(feed: Feed): Promise<AddFeedResult> {
		return this.tx(async (tx) => {
			const existing = await tx.get<Feed>('feeds', feed.id);
			if (existing) {
				return existing.personId === feed.personId
					? { status: 'already-attached' }
					: { status: 'belongs-to-other', personId: existing.personId };
			}
			await tx.put('feeds', feed.id, feed);
			return { status: 'added' };
		});
	}

	removeFeed(personId: string, feedId: string): Promise<void> {
		return this.tx(async (tx) => {
			const existing = await tx.get<Feed>('feeds', feedId);
			if (!existing || existing.personId !== personId) return;
			await tx.delete('feeds', feedId);
			for (const row of await tx.fields('yips', { eq: { feedId } })) {
				await tx.delete('yips', row.key as string);
			}
		});
	}

	unfollow(personId: string): Promise<void> {
		return this.tx(async (tx) => {
			await tx.delete('people', personId);
			for (const row of await tx.fields('feeds', { eq: { personId } })) {
				await tx.delete('feeds', row.key as string);
			}
			for (const row of await tx.fields('yips', { eq: { personId } })) {
				await tx.delete('yips', row.key as string);
			}
		});
	}

	async isFollowing(siteUrl: string): Promise<boolean> {
		const rows = await this.tx<unknown[]>((tx) =>
			tx.fields('people', { eq: { siteUrl }, limit: 1 })
		);
		return rows.length > 0;
	}

	updateFeed(feed: Feed): Promise<void> {
		return this.tx((tx) => tx.put('feeds', feed.id, feed));
	}

	updatePerson(person: Person): Promise<void> {
		return this.tx((tx) => tx.put('people', person.id, person));
	}

	// ---------- yips ----------

	/** A refetched yip keeps what the reader already did with it: `seenAt` and `readAt` win. */
	putYips(incoming: StoredYip[]): Promise<{ added: number }> {
		if (!incoming.length) return Promise.resolve({ added: 0 });
		return this.tx(async (tx) => {
			let added = 0;
			for (const yip of incoming) {
				const existing = await tx.get<StoredYip>('yips', yip.key);
				if (existing) {
					await tx.put('yips', yip.key, {
						...yip,
						seenAt: existing.seenAt,
						...(existing.readAt ? { readAt: existing.readAt } : {})
					});
				} else {
					added += 1;
					await tx.put('yips', yip.key, yip);
				}
			}
			return { added };
		});
	}

	/** Newest first, undated yips left out, as Feeds pages through them. */
	listYips(query: YipQuery = {}): Promise<StoredYip[]> {
		const { filter = 'everything', feedIds, limit = 100, before } = query;
		if (feedIds?.length === 0) return Promise.resolve([]);
		return this.tx((tx) =>
			tx.all<StoredYip, 'yips'>('yips', {
				...(filter === 'everything' ? {} : { eq: { category: filter } }),
				...(feedIds ? { in: { field: 'feedId', values: feedIds } } : {}),
				orderBy: { field: 'publishedAt', desc: true, ...(before ? { below: before } : {}) },
				limit
			})
		);
	}

	listAllYips(): Promise<StoredYip[]> {
		return this.tx((tx) => tx.all<StoredYip, 'yips'>('yips'));
	}

	async countUnread(): Promise<{ yips: number; people: number }> {
		const unread = await this.tx<Array<Record<string, string | null>>>((tx) =>
			tx.fields('yips', { eq: { readAt: null } })
		);
		return { yips: unread.length, people: new Set(unread.map((row) => row.personId)).size };
	}

	markRead(keys: string | string[]): Promise<void> {
		return this.tx(async (tx) => {
			const now = new Date().toISOString();
			for (const key of typeof keys === 'string' ? [keys] : [...new Set(keys)]) {
				const yip = await tx.get<StoredYip>('yips', key);
				if (yip && !yip.readAt) await tx.put('yips', key, { ...yip, readAt: now });
			}
		});
	}

	markAllRead(): Promise<void> {
		return this.tx(async (tx) => {
			const now = new Date().toISOString();
			for (const yip of await tx.all<StoredYip, 'yips'>('yips', { eq: { readAt: null } })) {
				await tx.put('yips', yip.key, { ...yip, readAt: now });
			}
		});
	}

	clearYips(): Promise<void> {
		return this.tx((tx) => tx.clear('yips'));
	}

	pruneYips(personId: string, cutoff: string): Promise<number> {
		return this.tx(async (tx) => {
			const old = await tx.fields('yips', {
				eq: { personId },
				orderBy: { field: 'publishedAt', below: cutoff }
			});
			for (const row of old) await tx.delete('yips', row.key as string);
			return old.length;
		});
	}

	// ---------- ring, peaks and settings ----------

	async readRing(): Promise<RingCacheRecord | null> {
		const record = await this.tx<RingCacheRecord | undefined>((tx) => tx.get('ring', 'current'));
		return record ?? null;
	}

	writeRing(record: RingCacheRecord): Promise<void> {
		return this.tx((tx) => tx.put('ring', 'current', record));
	}

	async readPeaks(key: string): Promise<PeaksRecord | null> {
		return (await this.tx<PeaksRecord | undefined>((tx) => tx.get('peaks', key))) ?? null;
	}

	writePeaks(record: PeaksRecord): Promise<void> {
		return this.tx((tx) => tx.put('peaks', record.key, record));
	}

	// ---------- shelf ----------

	async listShelf(): Promise<ShelfItem[]> {
		const items = await this.tx<ShelfItem[]>((tx) => tx.all<ShelfItem, 'shelf'>('shelf'));
		return items.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
	}

	saveToShelf(item: ShelfItem): Promise<void> {
		return this.tx(async (tx) => {
			if (!(await tx.get('shelf', item.id))) await tx.put('shelf', item.id, item);
		});
	}

	removeFromShelf(id: string): Promise<void> {
		return this.tx((tx) => tx.delete('shelf', id));
	}

	// ---------- verdicts ----------

	async listVerdicts(): Promise<VerdictRecord[]> {
		const rows = await this.tx<VerdictRecord[]>((tx) =>
			tx.all<VerdictRecord, 'verdicts'>('verdicts')
		);
		return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
	}

	setVerdict(record: VerdictRecord): Promise<void> {
		return this.tx((tx) => tx.put('verdicts', record.id, record));
	}

	removeVerdict(id: string): Promise<void> {
		return this.tx((tx) => tx.delete('verdicts', id));
	}

	// ---------- places ----------

	listPlaces(creatorKey?: string): Promise<PlaceRecord[]> {
		return this.tx((tx) =>
			tx.all<PlaceRecord, 'places'>('places', creatorKey ? { eq: { creatorKey } } : {})
		);
	}

	putPlace(record: PlaceRecord): Promise<void> {
		return this.tx((tx) => tx.put('places', record.id, record));
	}

	removePlace(id: string): Promise<void> {
		return this.tx((tx) => tx.delete('places', id));
	}

	// ---------- creators ----------

	listCreators(): Promise<CreatorRecord[]> {
		return this.tx((tx) => tx.all<CreatorRecord, 'creators'>('creators'));
	}

	putCreator(record: CreatorRecord): Promise<void> {
		return this.tx((tx) => tx.put('creators', record.id, record));
	}

	removeCreator(id: string): Promise<void> {
		return this.tx((tx) => tx.delete('creators', id));
	}

	// ---------- settings ----------

	async getSetting<T>(key: SettingKey): Promise<T | null> {
		const record = await this.tx<{ value: T } | undefined>((tx) => tx.get('settings', key));
		return record?.value ?? null;
	}

	setSetting<T>(key: SettingKey, value: T): Promise<void> {
		return this.tx((tx) => tx.put('settings', key, { value }));
	}

	// ---------- references ----------

	async listReferences(creatorId?: string): Promise<Reference[]> {
		const rows = await this.tx<Reference[]>((tx) =>
			tx.all<Reference, 'references'>(
				'references',
				creatorId === undefined ? {} : { eq: { creatorId } }
			)
		);
		return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
	}

	putReference(reference: Reference): Promise<void> {
		return this.tx((tx) => tx.put('references', reference.id, reference));
	}

	removeReference(id: string): Promise<void> {
		return this.tx((tx) => tx.delete('references', id));
	}

	updateReferenceCheck(id: string, check: ReferenceCheck): Promise<void> {
		return this.tx(async (tx) => {
			const existing = await tx.get<Reference>('references', id);
			if (existing) await tx.put('references', id, { ...existing, ...check });
		});
	}
	// ---------- forums ----------

	async listForumFollows(): Promise<ForumFollow[]> {
		const follows = await this.tx<ForumFollow[]>((tx) => tx.all<ForumFollow, 'forums'>('forums'));
		return follows.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
	}

	putForumFollow(follow: ForumFollow): Promise<void> {
		return this.tx((tx) => tx.put('forums', follow.id, follow));
	}

	removeForumFollow(id: string): Promise<void> {
		return this.tx(async (tx) => {
			await tx.delete('forums', id);
			for (const row of await tx.fields('forumTopics', { eq: { followId: id } })) {
				await tx.delete('forumTopics', row.key as string);
			}
		});
	}

	async listForumTopics(): Promise<ForumTopicRecord[]> {
		const topics = await this.tx<ForumTopicRecord[]>((tx) =>
			tx.all<ForumTopicRecord, 'forumTopics'>('forumTopics')
		);
		return topics.sort(
			(a, b) =>
				(b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.key.localeCompare(b.key)
		);
	}

	putForumTopics(topics: ForumTopicRecord[]): Promise<void> {
		if (!topics.length) return Promise.resolve();
		return this.tx(async (tx) => {
			for (const topic of topics) {
				const existing = await tx.get<ForumTopicRecord>('forumTopics', topic.key);
				await tx.put(
					'forumTopics',
					topic.key,
					existing
						? {
								...topic,
								firstSeenAt: existing.firstSeenAt,
								...(existing.seenPostNumber !== undefined
									? { seenPostNumber: existing.seenPostNumber }
									: {}),
								...(existing.seenAt ? { seenAt: existing.seenAt } : {})
							}
						: topic
				);
			}
		});
	}

	markForumTopicSeen(key: string, postNumber: number, at: string): Promise<void> {
		return this.tx(async (tx) => {
			const topic = await tx.get<ForumTopicRecord>('forumTopics', key);
			if (topic)
				await tx.put('forumTopics', key, { ...topic, seenPostNumber: postNumber, seenAt: at });
		});
	}

	pruneForumTopics(cutoff: string): Promise<number> {
		return this.tx(async (tx) => {
			let removed = 0;
			for (const topic of await tx.all<ForumTopicRecord, 'forumTopics'>('forumTopics')) {
				if ((topic.lastActivityAt ?? topic.firstSeenAt) < cutoff) {
					await tx.delete('forumTopics', topic.key);
					removed += 1;
				}
			}
			return removed;
		});
	}
}
