import { describe, expect, it } from 'vitest';
import { cleanFolder, folderList, matchFolder } from './folders.js';
import type { Person } from './store/index.js';

function person(id: string, folder?: string): Person {
	return {
		id,
		name: id,
		siteUrl: `https://${id}.example/`,
		followedAt: '2026-10-01T00:00:00.000Z',
		...(folder ? { folder } : {})
	};
}

describe('cleanFolder', () => {
	it('trims and collapses whitespace', () => {
		expect(cleanFolder('  Close   friends ')).toBe('Close friends');
	});

	it('is undefined for nothing usable', () => {
		expect(cleanFolder('   ')).toBeUndefined();
		expect(cleanFolder(null)).toBeUndefined();
	});

	it('caps the length', () => {
		expect(cleanFolder('x'.repeat(200))).toHaveLength(40);
	});
});

describe('folderList', () => {
	it('lists each folder in use once, by name, with how many people are in it', () => {
		const people = [person('a', 'Music'), person('b'), person('c', 'comics'), person('d', 'Music')];
		expect(folderList(people)).toEqual([
			{ name: 'comics', count: 1 },
			{ name: 'Music', count: 2 }
		]);
	});

	it('is empty when nobody is in a folder', () => {
		expect(folderList([person('a')])).toEqual([]);
	});
});

describe('matchFolder', () => {
	it('joins an existing folder whatever the capitals', () => {
		expect(matchFolder('music', [{ name: 'Music', count: 1 }])).toBe('Music');
	});

	it('keeps a new name as typed', () => {
		expect(matchFolder('Zines', [{ name: 'Music', count: 1 }])).toBe('Zines');
	});
});
