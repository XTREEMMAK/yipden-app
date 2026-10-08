/**
 * The layer under `DocStore`: named collections of JSON records, each with a string key and a
 * few indexed fields.
 *
 * `DocStore` holds every rule about follows, yips and the rest, written once. A backend only
 * keeps records: SQLite (SQLCipher on the phone, sql.js in tests) or IndexedDB with every value
 * encrypted (the web build). That keeps the two encrypted stores from drifting apart in
 * behaviour, which two full `Store` implementations would.
 */

export type Collection =
	| 'people'
	| 'feeds'
	| 'yips'
	| 'ring'
	| 'peaks'
	| 'settings'
	| 'shelf'
	| 'verdicts'
	| 'meta'
	| 'references'
	| 'forums'
	| 'forumTopics'
	| 'creators'
	| 'places'
	| 'siteFollows'
	| 'siteUpdates';

export const COLLECTIONS: readonly Collection[] = [
	'people',
	'feeds',
	'yips',
	'ring',
	'peaks',
	'settings',
	'shelf',
	'verdicts',
	'meta',
	'references',
	'forums',
	'forumTopics',
	'creators',
	'places',
	'siteFollows',
	'siteUpdates'
];

/**
 * Fields a query can filter or sort on, per collection, copied out of the record when it is
 * written. Everything else is only in the record itself.
 */
export const INDEXED = {
	people: ['siteUrl'],
	feeds: ['personId'],
	yips: ['personId', 'feedId', 'publishedAt', 'category', 'readAt'],
	ring: [],
	peaks: [],
	settings: [],
	shelf: [],
	verdicts: [],
	meta: [],
	references: ['creatorId', 'kind'],
	forums: ['forumUrl'],
	forumTopics: ['forumUrl', 'followId', 'lastActivityAt'],
	creators: [],
	places: ['creatorKey'],
	siteFollows: [],
	siteUpdates: ['followId', 'publishedAt']
} as const satisfies Record<Collection, readonly string[]>;

export type IndexedField<C extends Collection> = (typeof INDEXED)[C][number];

/** An indexed field's value: a string, or null when the record has none. */
export type IndexValue = string | null;

export interface RecordQuery<C extends Collection> {
	/** Exact matches. `null` matches records where the field is absent. */
	eq?: Partial<Record<IndexedField<C>, IndexValue>>;
	/** The field is one of these. An empty list matches nothing. */
	in?: { field: IndexedField<C>; values: readonly string[] };
	/**
	 * Sort by this field, skipping records that have none (as an IndexedDB index does), newest
	 * first when `desc`. `below` keeps only values strictly less than it.
	 */
	orderBy?: { field: IndexedField<C>; desc?: boolean; below?: string };
	limit?: number;
}

/** One unit of work. Everything done through one `RecordTx` commits together or not at all. */
export interface RecordTx {
	get<T>(collection: Collection, key: string): Promise<T | undefined>;
	put(collection: Collection, key: string, value: object): Promise<void>;
	delete(collection: Collection, key: string): Promise<void>;
	clear(collection: Collection): Promise<void>;
	all<T, C extends Collection>(collection: C, query?: RecordQuery<C>): Promise<T[]>;
	/** Only the indexed fields of matching records, which is far cheaper than whole records. */
	fields<C extends Collection>(
		collection: C,
		query?: RecordQuery<C>
	): Promise<Array<Record<IndexedField<C> | 'key', IndexValue>>>;
}

export interface RecordBackend {
	open(): Promise<void>;
	/**
	 * Run `work` as one transaction. Backends run transactions one at a time, so two store calls
	 * made at once never interleave inside the database.
	 */
	transaction<T>(work: (tx: RecordTx) => Promise<T>): Promise<T>;
}

/** The indexed field values of a record, as a backend stores them beside it. */
export function indexValues<C extends Collection>(
	collection: C,
	value: object
): Record<IndexedField<C>, IndexValue> {
	const source = value as Record<string, unknown>;
	const out = {} as Record<IndexedField<C>, IndexValue>;
	for (const field of INDEXED[collection] as readonly IndexedField<C>[]) {
		const raw = source[field];
		out[field] = typeof raw === 'string' ? raw : null;
	}
	return out;
}

/** Whether a record's index values match a query's filters. For backends that filter in memory. */
export function matches<C extends Collection>(
	values: Record<string, IndexValue>,
	query: RecordQuery<C> = {}
): boolean {
	for (const [field, expected] of Object.entries(query.eq ?? {})) {
		if ((values[field] ?? null) !== expected) return false;
	}
	if (query.in) {
		const actual = values[query.in.field];
		if (actual === null || actual === undefined || !query.in.values.includes(actual)) return false;
	}
	if (query.orderBy) {
		const actual = values[query.orderBy.field];
		if (actual === null || actual === undefined) return false;
		if (query.orderBy.below !== undefined && !(actual < query.orderBy.below)) return false;
	}
	return true;
}

/** Sort and cut matching rows the way a query asks. For backends that filter in memory. */
export function ordered<C extends Collection, R extends { values: Record<string, IndexValue> }>(
	rows: R[],
	query: RecordQuery<C> = {}
): R[] {
	let result = rows.filter((row) => matches(row.values, query));
	const order = query.orderBy;
	if (order) {
		result = result.sort((a, b) => {
			const left = a.values[order.field] as string;
			const right = b.values[order.field] as string;
			const compared = left < right ? -1 : left > right ? 1 : 0;
			return order.desc ? -compared : compared;
		});
	}
	return query.limit !== undefined ? result.slice(0, query.limit) : result;
}

/** One-at-a-time execution for a backend's transactions. */
export class Serial {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(work: () => Promise<T>): Promise<T> {
		const next = this.tail.then(work, work);
		this.tail = next.catch(() => undefined);
		return next;
	}
}
