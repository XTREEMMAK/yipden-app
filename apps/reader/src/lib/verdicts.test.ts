import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { testStore } from './store/testing/memory.js';
import type { Store } from './store/types.js';
import { createBackup, parseBackup, restoreBackup } from './backup.js';
import { verdictKey } from './verdicts.svelte.js';
import type { VerdictRecord } from './store/types.js';

const ADA: VerdictRecord = {
	id: 'ada.example.com',
	url: 'https://www.ada.example.com/',
	name: 'Ada Reed',
	verdict: 'liked',
	source: 'indienodes',
	at: '2026-09-30T10:00:00.000Z'
};

describe('verdictKey', () => {
	it('is the same creator however the address is written', () => {
		expect(verdictKey('https://www.Ada.example.com/')).toBe('ada.example.com');
		expect(verdictKey('http://ada.example.com')).toBe('ada.example.com');
		expect(verdictKey('https://ada.example.com/?ref=x#top')).toBe('ada.example.com');
	});

	it('keeps a path, so two profiles on one host stay two creators', () => {
		expect(verdictKey('https://social.example/@ada')).not.toBe(
			verdictKey('https://social.example/@bo')
		);
	});
});

describe('verdict store and backup', () => {
	let store: Store;

	beforeEach(async () => {
		globalThis.indexedDB = new IDBFactory();
		store = testStore();
		await store.init();
	});

	it('keeps one verdict per creator, newest first', async () => {
		await store.setVerdict(ADA);
		await store.setVerdict({ ...ADA, verdict: 'hidden', at: '2026-09-30T11:00:00.000Z' });
		await store.setVerdict({
			...ADA,
			id: 'bo.example.com',
			name: 'Bo',
			at: '2026-09-30T12:00:00.000Z'
		});

		const all = await store.listVerdicts();
		expect(all.map((item) => item.id)).toEqual(['bo.example.com', 'ada.example.com']);
		expect(all[1]!.verdict).toBe('hidden');

		await store.removeVerdict('bo.example.com');
		expect(await store.listVerdicts()).toHaveLength(1);
	});

	it('round-trips through a backup without overriding a choice made here', async () => {
		await store.setVerdict(ADA);
		const backup = parseBackup(JSON.stringify(await createBackup(store))).backup;

		globalThis.indexedDB = new IDBFactory();
		const fresh = testStore();
		await fresh.init();
		await fresh.setVerdict({ ...ADA, verdict: 'hidden' });
		await fresh.setVerdict({ ...ADA, id: 'cy.example.com', name: 'Cy' });
		const report = await restoreBackup(
			{ ...backup, verdicts: [...backup.verdicts!, { ...ADA, id: 'cy.example.com' }] },
			fresh
		);

		expect(report.verdictsAdded).toBe(0);
		expect((await fresh.listVerdicts()).find((item) => item.id === ADA.id)?.verdict).toBe('hidden');
	});
});
