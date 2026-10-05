import { describe, expect, it } from 'vitest';
import {
	countByType,
	countsLine,
	groupByCreator,
	groupByDate,
	groupByType,
	libraryHref,
	libraryItems,
	searchLibrary
} from './library.js';
import { reference } from './store/testing/fixtures.js';
import type { Person, ShelfItem } from './store/types.js';

const LENA: Person = {
	id: 'p-lena',
	name: 'Lena Ofori',
	siteUrl: 'https://lena.example/',
	followedAt: '2026-09-01T00:00:00.000Z'
};

const track = reference({
	id: 'ref_track',
	creatorId: 'lena.example',
	title: 'Night drive',
	createdAt: '2026-10-04T09:00:00.000Z'
});
const passage = reference({
	id: 'ref_passage',
	kind: 'text',
	creatorId: 'ash.example',
	creatorName: 'Ash & Ember',
	title: 'The fox went…',
	url: 'https://ash.example/story',
	selector: { exact: 'The fox went down to the river.' },
	createdAt: '2026-10-03T09:00:00.000Z'
});
const picture = reference({
	id: 'ref_picture',
	kind: 'image',
	creatorId: 'comics.example/strip',
	title: 'Page one',
	url: 'https://comics.example/strip/1.png',
	createdAt: '2026-09-02T09:00:00.000Z',
	status: 'gone'
});
const link: ShelfItem = {
	id: 'https://wide.example/',
	url: 'https://wide.example/',
	title: 'Wide Screen',
	creator: 'Wide Screen',
	via: 'Fixture Ring',
	from: 'discover',
	savedAt: '2026-10-04T10:00:00.000Z'
};

const items = libraryItems([track, passage, picture], [link], [LENA]);

describe('libraryItems', () => {
	it('puts kept things and saved links together, newest first', () => {
		expect(items.map((item) => item.key)).toEqual([
			'link:https://wide.example/',
			'ref_track',
			'ref_passage',
			'ref_picture'
		]);
	});

	it('names each creator: as kept, else a followed person, else their address', () => {
		expect(items.map((item) => item.creatorName)).toEqual([
			'Wide Screen',
			'Lena Ofori',
			'Ash & Ember',
			'comics.example'
		]);
		expect(items.find((item) => item.key === 'ref_track')?.creatorUrl).toBe(
			'https://lena.example/'
		);
		expect(items.find((item) => item.key === 'ref_picture')?.creatorUrl).toBe(
			'https://comics.example/strip'
		);
	});

	it('marks what their site no longer has', () => {
		expect(items.find((item) => item.key === 'ref_picture')?.gone).toBe(true);
	});
});

describe('counting and searching', () => {
	it('counts only the types there are, in words', () => {
		expect(countsLine(countByType(items))).toBe('1 track · 1 passage · 1 picture · 1 link');
		expect(countsLine(countByType([]))).toBe('');
	});

	it('finds by title, creator, address and a passage’s words, every word', () => {
		const keys = (query: string) => searchLibrary(items, query).map((item) => item.key);
		expect(keys('night')).toEqual(['ref_track']);
		expect(keys('lena')).toEqual(['ref_track']);
		expect(keys('river')).toEqual(['ref_passage']);
		expect(keys('ash river')).toEqual(['ref_passage']);
		expect(keys('ash night')).toEqual([]);
		expect(keys('fixture')).toEqual(['link:https://wide.example/']);
		expect(keys('   ')).toHaveLength(4);
	});
});

describe('arranging', () => {
	it('by type, in a fixed order, leaving out empty types', () => {
		expect(groupByType(items).map((group) => group.label)).toEqual([
			'Tracks',
			'Passages',
			'Pictures',
			'Links'
		]);
	});

	it('by creator, by name', () => {
		expect(groupByCreator(items).map((group) => group.label)).toEqual([
			'Ash & Ember',
			'comics.example',
			'Lena Ofori',
			'Wide Screen'
		]);
	});

	it('by date, from today back', () => {
		const groups = groupByDate(items, new Date('2026-10-04T12:00:00.000Z'));
		expect(groups.map((group) => [group.label, group.items.length])).toEqual([
			['Today', 2],
			['Yesterday', 1],
			[
				new Date('2026-09-02T09:00:00.000Z').toLocaleDateString(undefined, {
					month: 'long',
					year: 'numeric'
				}),
				1
			]
		]);
	});
});

describe('libraryHref', () => {
	it('opens You at the Library, narrowed to a creator or a type', () => {
		expect(libraryHref({ creatorId: 'lena.example' })).toBe(
			'/you?tab=library&library=creator&of=lena.example#library'
		);
		expect(libraryHref({ type: 'links' })).toBe('/you?tab=library&library=type&of=links#library');
	});
});
