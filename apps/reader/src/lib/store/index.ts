import { IdbStore } from './idb.js';
import type { Store } from './types.js';

/**
 * The app's one store.
 *
 * A singleton because there is one database and one device. Tests construct `IdbStore`
 * directly rather than reaching for this, so they never share state with each other.
 */
export const store: Store = new IdbStore();

export type {
	AddFeedResult,
	Feed,
	FeedProvenance,
	PeaksRecord,
	Person,
	SettingKey,
	Store,
	StoredYip,
	YipCategory,
	YipQuery
} from './types.js';
