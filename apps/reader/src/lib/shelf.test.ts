import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { shelf, shelfItemFrom } from './shelf.svelte.js';
import { store } from './store/index.js';
import { you } from './you.svelte.js';
import { exportOpml } from './opml.js';

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
	shelf.items = [];
});

const draft = {
	url: 'https://wide.example.com/essay',
	title: 'A wide essay',
	creator: 'Wide',
	from: 'feeds' as const
};

describe('shelfItemFrom', () => {
	it('uses the address as the identity and refuses one it would never open', () => {
		expect(shelfItemFrom(draft)?.id).toBe('https://wide.example.com/essay');
		for (const url of [
			'http://wide.example.com/',
			'javascript:alert(1)',
			'https://localhost/',
			''
		]) {
			expect(shelfItemFrom({ ...draft, url })).toBeNull();
		}
	});

	it('bounds what it stores and falls back to the host for a blank title', () => {
		const item = shelfItemFrom({ ...draft, title: '  ', creator: 'x'.repeat(500) });
		expect(item?.title).toBe('wide.example.com');
		expect(item?.creator).toHaveLength(100);
		expect(shelfItemFrom({ ...draft, title: 'y'.repeat(900) })?.title).toHaveLength(300);
	});

	it('survives an unreadable date', () => {
		expect(() => shelfItemFrom(draft, new Date('nope'))).not.toThrow();
	});
});

describe('the shelf state', () => {
	it('saves, recognizes and removes an address', async () => {
		expect(shelf.has(draft.url)).toBe(false);
		expect(await shelf.toggle(draft)).toBe(true);
		expect(shelf.has(draft.url)).toBe(true);
		expect((await store.listShelf()).map((item) => item.url)).toEqual([draft.url]);

		expect(await shelf.toggle(draft)).toBe(false);
		expect(shelf.has(draft.url)).toBe(false);
		expect(await store.listShelf()).toEqual([]);
	});

	it('reloads what was saved', async () => {
		await shelf.toggle(draft);
		shelf.items = [];
		await shelf.load();
		expect(shelf.items).toHaveLength(1);
	});
});

describe('exporting and importing through You', () => {
	it('carries the shelf in the follows file and takes it back once', async () => {
		await shelf.toggle(draft);
		await you.load();
		const xml = you.toOpml();
		expect(xml).toContain('https://wide.example.com/essay');

		// A fresh device: the singleton keeps its own database handle, so empty it through the store.
		await shelf.remove(draft.url);
		expect(await store.listShelf()).toEqual([]);

		expect(await you.importOpml(xml)).toMatchObject({ people: 0, saved: 1 });
		expect(shelf.items.map((item) => item.url)).toEqual([draft.url]);
		// Importing the same file again adds nothing.
		expect(await you.importOpml(xml)).toMatchObject({ saved: 0 });
		expect(shelf.items).toHaveLength(1);
	});

	it('exports a shelf even with nothing followed', () => {
		const item = shelfItemFrom(draft)!;
		expect(exportOpml([], new Map(), [item])).toContain('yipdenShelf');
	});
});
