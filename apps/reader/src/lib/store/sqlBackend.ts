import {
	INDEXED,
	Serial,
	indexValues,
	type Collection,
	type IndexValue,
	type IndexedField,
	type RecordBackend,
	type RecordQuery,
	type RecordTx
} from './records.js';

/**
 * Records in SQLite: one table per collection, the record as JSON, and each indexed field in a
 * column of its own so queries, sorting and counts run in the database rather than after every
 * record has crossed the native bridge.
 */

export type SqlValue = string | number | null;

/** What this backend needs from a SQLite connection. The Capacitor plugin and sql.js both fit. */
export interface SqlDriver {
	open(): Promise<void>;
	/** Several statements, no parameters: schema only. */
	exec(sql: string): Promise<void>;
	run(sql: string, params?: SqlValue[]): Promise<void>;
	all(sql: string, params?: SqlValue[]): Promise<Array<Record<string, SqlValue>>>;
	begin(): Promise<void>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
}

/** `publishedAt` → `published_at`. Column names come only from `INDEXED`, never from input. */
const column = (field: string) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** Table names: the collection, quoted, because `references` is reserved in SQL. */
const table = (collection: Collection) => `"${collection}"`;

/** Bump with a new step in `migrations`; never edit a step that has shipped. */
const SCHEMA_VERSION = 5;

/** One collection's table, with a column and an index for each of its indexed fields. */
function tableSql(collection: Collection): string {
	const fields = INDEXED[collection] as readonly string[];
	const columns = fields.map((field) => `, ${column(field)} TEXT`).join('');
	const indexes = fields
		.map(
			(field) =>
				`CREATE INDEX IF NOT EXISTS ${collection}_${column(field)} ON ${table(collection)} (${column(field)});`
		)
		.join('\n');
	return `CREATE TABLE IF NOT EXISTS ${table(collection)} (k TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL${columns});\n${indexes}`;
}

const migrations: Array<() => string> = [
	// 1: the collections the first encrypted store shipped with (2026-10-04).
	() =>
		(['people', 'feeds', 'yips', 'ring', 'peaks', 'settings', 'shelf', 'verdicts', 'meta'] as const)
			.map(tableSql)
			.join('\n'),
	// 2: references, which replace the reader tracks setting.
	() => tableSql('references'),
	// 3: followed forums and their topics (the library and forums brief, Part 2).
	() => [tableSql('forums'), tableSql('forumTopics')].join('\n'),
	// 4: creators known by more than one address (the Creator Database, step 2).
	() => tableSql('creators'),
	// 5: where creators are, with how sure that is (the Creator Database, step 3).
	() => tableSql('places')
];

export class SqlBackend implements RecordBackend {
	private readonly serial = new Serial();
	private opened: Promise<void> | null = null;

	constructor(private readonly driver: SqlDriver) {}

	open(): Promise<void> {
		this.opened ??= this.serial
			.run(async () => {
				await this.driver.open();
				const [row] = await this.driver.all('PRAGMA user_version');
				const version = Number(row?.user_version ?? 0);
				for (let step = version; step < SCHEMA_VERSION; step += 1) {
					await this.driver.begin();
					try {
						await this.driver.exec(migrations[step]!());
						await this.driver.exec(`PRAGMA user_version = ${step + 1}`);
						await this.driver.commit();
					} catch (cause) {
						await this.driver.rollback();
						throw cause;
					}
				}
			})
			.catch((cause: unknown) => {
				this.opened = null;
				throw cause;
			});
		return this.opened;
	}

	transaction<T>(work: (tx: RecordTx) => Promise<T>): Promise<T> {
		return this.serial.run(async () => {
			await this.driver.begin();
			try {
				const result = await work(new SqlTx(this.driver));
				await this.driver.commit();
				return result;
			} catch (cause) {
				await this.driver.rollback();
				throw cause;
			}
		});
	}
}

class SqlTx implements RecordTx {
	constructor(private readonly driver: SqlDriver) {}

	async get<T>(collection: Collection, key: string): Promise<T | undefined> {
		const [row] = await this.driver.all(`SELECT data FROM ${table(collection)} WHERE k = ?`, [key]);
		return row ? (JSON.parse(String(row.data)) as T) : undefined;
	}

	async put(collection: Collection, key: string, value: object): Promise<void> {
		const values = indexValues(collection, value);
		const fields = Object.keys(values);
		const columns = ['k', 'data', ...fields.map(column)];
		await this.driver.run(
			`INSERT OR REPLACE INTO ${table(collection)} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
			[key, JSON.stringify(value), ...fields.map((field) => values[field as never] as IndexValue)]
		);
	}

	async delete(collection: Collection, key: string): Promise<void> {
		await this.driver.run(`DELETE FROM ${table(collection)} WHERE k = ?`, [key]);
	}

	async clear(collection: Collection): Promise<void> {
		await this.driver.run(`DELETE FROM ${table(collection)}`);
	}

	async all<T, C extends Collection>(collection: C, query: RecordQuery<C> = {}): Promise<T[]> {
		const rows = await this.select(collection, 'data', query);
		return rows.map((row) => JSON.parse(String(row.data)) as T);
	}

	async fields<C extends Collection>(
		collection: C,
		query: RecordQuery<C> = {}
	): Promise<Array<Record<IndexedField<C> | 'key', IndexValue>>> {
		const fields = INDEXED[collection] as readonly string[];
		const select = ['k', ...fields.map(column)].join(', ');
		const rows = await this.select(collection, select, query);
		return rows.map((row) => {
			const out: Record<string, IndexValue> = { key: String(row.k) };
			for (const field of fields) {
				const value = row[column(field)];
				out[field] = value === null || value === undefined ? null : String(value);
			}
			return out as Record<IndexedField<C> | 'key', IndexValue>;
		});
	}

	private select<C extends Collection>(
		collection: C,
		select: string,
		query: RecordQuery<C>
	): Promise<Array<Record<string, SqlValue>>> {
		const allowed = new Set<string>(INDEXED[collection]);
		const where: string[] = [];
		const params: SqlValue[] = [];
		const checked = (field: string) => {
			if (!allowed.has(field)) throw new Error(`${field} is not indexed on ${collection}`);
			return column(field);
		};

		for (const [field, value] of Object.entries(query.eq ?? {})) {
			if (value === null) where.push(`${checked(field)} IS NULL`);
			else {
				where.push(`${checked(field)} = ?`);
				params.push(value as string);
			}
		}
		if (query.in) {
			if (!query.in.values.length) return Promise.resolve([]);
			where.push(`${checked(query.in.field)} IN (${query.in.values.map(() => '?').join(', ')})`);
			params.push(...query.in.values);
		}
		let order = '';
		if (query.orderBy) {
			const name = checked(query.orderBy.field);
			where.push(`${name} IS NOT NULL`);
			if (query.orderBy.below !== undefined) {
				where.push(`${name} < ?`);
				params.push(query.orderBy.below);
			}
			const direction = query.orderBy.desc ? 'DESC' : 'ASC';
			// The key breaks ties, the same way an IndexedDB index cursor orders equal values.
			order = ` ORDER BY ${name} ${direction}, k ${direction}`;
		}
		const limit = query.limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(query.limit))}` : '';
		const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
		return this.driver.all(
			`SELECT ${select} FROM ${table(collection)}${clause}${order}${limit}`,
			params
		);
	}
}
