import { Capacitor } from '@capacitor/core';
import { capacitorDriver } from './capacitorDriver.js';
import { DocStore } from './docStore.js';
import { EncryptedIdbBackend } from './encryptedIdbBackend.js';
import { migrateFromIdb } from './migrate.js';
import { SqlBackend } from './sqlBackend.js';
import type { Store } from './types.js';

/**
 * The app's one store, encrypted at rest.
 *
 * On the phone, SQLite encrypted by SQLCipher, its key in the Android Keystore. On the web,
 * where there is no keystore, IndexedDB with every value encrypted by a non-extractable WebCrypto
 * key, which is weaker (see DECISIONS.md). Either way the first open moves anything left in the
 * old plaintext IndexedDB store across and then deletes it (`migrate.ts`).
 *
 * A singleton because there is one database and one device. Tests construct their own stores
 * rather than reaching for this, so they never share state with each other.
 */
export const store: Store = new DocStore(
	Capacitor.isNativePlatform()
		? new SqlBackend(capacitorDriver())
		: new EncryptedIdbBackend('yipden-sealed'),
	migrateFromIdb
);

export type {
	AddFeedResult,
	Feed,
	FeedError,
	FeedProblem,
	FeedProvenance,
	PeaksRecord,
	Person,
	SettingKey,
	ShelfItem,
	Store,
	StoredYip,
	Verdict,
	VerdictRecord,
	YipCategory,
	YipQuery
} from './types.js';
