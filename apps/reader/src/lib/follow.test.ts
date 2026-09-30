import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { DiscoveryResult } from '@yipden/feeds';
import type { RingEntry } from '@yipden/ring-client';
import { followDiscovered, followRingSelection } from './follow.js';
import { store } from './store/index.js';

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
});

const entry: RingEntry = {
	id: 'text-wide',
	creator: 'Wide',
	type: 'text',
	source_url: 'https://wide.example.com/'
};

function found(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
	return {
		canonicalUrl: 'https://wide.example.com/',
		title: 'Wide',
		iconUrl: null,
		feeds: [],
		unresolved: [],
		...overrides
	};
}

describe('remembering how a site is built to be read', () => {
	it('keeps what a ring member declared', async () => {
		const { person } = await followRingSelection({ ...entry, layout: 'desktop-first' }, []);
		expect(person.layout).toBe('desktop-first');
		expect((await store.listPeople())[0]?.layout).toBe('desktop-first');
	});

	it('records nothing for a ring member who declared nothing', async () => {
		const { person } = await followRingSelection(entry, []);
		expect('layout' in person).toBe(false);
	});

	it('keeps the heuristic for a pasted link, and nothing when there was no page to look at', async () => {
		expect((await followDiscovered(found({ layout: 'desktop-first' }), [])).person.layout).toBe(
			'desktop-first'
		);
		expect('layout' in (await followDiscovered(found(), [])).person).toBe(false);
	});
});
