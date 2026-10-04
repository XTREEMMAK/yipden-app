import { DocStore } from '../docStore.js';
import { SqlBackend } from '../sqlBackend.js';
import { sqljsDriver } from './sqljs.js';

/** A fresh, empty store for one test: the app's own `DocStore` over SQLite, in memory. */
export function testStore(): DocStore {
	return new DocStore(new SqlBackend(sqljsDriver()));
}
