import type { SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver, SqlValue } from './sqlBackend.js';

/**
 * The phone's `SqlDriver`: `@capacitor-community/sqlite`, with SQLCipher encrypting the file.
 *
 * The key. On first launch 32 random bytes from the platform CSPRNG become the database key and
 * are handed once to the plugin's `setEncryptionSecret`. The plugin keeps it in
 * EncryptedSharedPreferences under an AES-256-GCM master key held in the Android Keystore, and
 * reads it back natively to open the database. JavaScript never stores it, logs it or reads it
 * back. Written as SQLCipher's raw-key form, `x'…'`, so the 256 random bits are the key itself
 * rather than a passphrase put through key derivation on every launch.
 *
 * Every statement is run with the plugin's own per-call transaction turned off: the backend
 * opens and closes transactions itself, and a nested one would fail.
 */

const DATABASE = 'yipden';

function newKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `x'${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}'`;
}

async function connect(sqlite: SQLiteConnection): Promise<SQLiteDBConnection> {
	const { result: hasKey } = await sqlite.isSecretStored();
	if (!hasKey) {
		// A database without its key cannot be read by anyone, this app included. It only happens
		// if the Keystore entry was lost while the file survived, and starting empty is all that
		// is left; the reader's own exported backup is the way back.
		if ((await sqlite.isDatabase(DATABASE)).result) {
			const stale = await sqlite.createConnection(DATABASE, false, 'no-encryption', 1, false);
			await stale.delete().catch(() => undefined);
			await sqlite.closeConnection(DATABASE, false).catch(() => undefined);
		}
		await sqlite.setEncryptionSecret(newKey());
	}

	const consistent = (await sqlite.checkConnectionsConsistency()).result;
	const existing = (await sqlite.isConnection(DATABASE, false)).result;
	if (consistent && existing) return sqlite.retrieveConnection(DATABASE, false);
	return sqlite.createConnection(DATABASE, true, 'secret', 1, false);
}

export function capacitorDriver(): SqlDriver {
	let db: SQLiteDBConnection | null = null;
	const database = () => {
		if (!db) throw new Error('the database is not open');
		return db;
	};

	return {
		async open() {
			const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
			db = await connect(new SQLiteConnection(CapacitorSQLite));
			if (!(await db.isDBOpen()).result) await db.open();
		},
		async exec(sql) {
			await database().execute(sql, false);
		},
		async run(sql, params = []) {
			await database().run(sql, params, false);
		},
		async all(sql, params = []) {
			const { values } = await database().query(sql, params);
			return (values ?? []) as Array<Record<string, SqlValue>>;
		},
		async begin() {
			await database().beginTransaction();
		},
		async commit() {
			await database().commitTransaction();
		},
		async rollback() {
			if ((await database().isTransactionActive()).result) await database().rollbackTransaction();
		}
	};
}
