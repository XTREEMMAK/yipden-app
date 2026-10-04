import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs, { type Database } from 'sql.js';
import type { SqlDriver, SqlValue } from '../sqlBackend.js';

/**
 * A `SqlDriver` over sql.js (SQLite compiled to WebAssembly), for tests only: the same SQL the
 * phone runs through SQLCipher, without a phone. `file` keeps the bytes between two drivers, so
 * a test can close the app and open it again on the same database.
 */
export function sqljsDriver(file: { bytes?: Uint8Array } = {}): SqlDriver & { save(): void } {
	let db: Database | null = null;
	const database = () => {
		if (!db) throw new Error('not open');
		return db;
	};
	return {
		async open() {
			// Handed the bytes directly: under jsdom sql.js picks its browser build, which would try
			// to fetch the file by URL.
			const wasmBinary = readFileSync(
				createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
			);
			const SQL = await initSqlJs({
				wasmBinary: wasmBinary.buffer.slice(
					wasmBinary.byteOffset,
					wasmBinary.byteOffset + wasmBinary.byteLength
				) as ArrayBuffer
			});
			db = new SQL.Database(file.bytes);
		},
		async exec(sql) {
			database().exec(sql);
		},
		async run(sql, params = []) {
			database().run(sql, params);
		},
		async all(sql, params = []) {
			const statement = database().prepare(sql);
			statement.bind(params);
			const rows: Array<Record<string, SqlValue>> = [];
			while (statement.step()) rows.push(statement.getAsObject() as Record<string, SqlValue>);
			statement.free();
			return rows;
		},
		async begin() {
			database().exec('BEGIN');
		},
		async commit() {
			database().exec('COMMIT');
			file.bytes = database().export();
		},
		async rollback() {
			database().exec('ROLLBACK');
		},
		save() {
			file.bytes = database().export();
		}
	};
}
