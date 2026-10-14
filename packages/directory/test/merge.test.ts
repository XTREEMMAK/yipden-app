import { describe, expect, it } from 'vitest';
import { DEFAULT_RING_URL } from '@yipden/ring-client';
import {
	featuredToday,
	filterPeople,
	indieNodesSource,
	listSource,
	mergePeople,
	next,
	prev,
	shuffle,
	tagCounts,
	validateOptOuts,
	yipdenSource,
	type Person
} from '../src/index.js';
import {
	fakeFetch,
	liveRing,
	sampleList,
	sampleOptOuts,
	testSeed,
	testSeedOptOuts
} from './helpers.js';

const PEOPLE_URL = 'https://yipden.com/directory/people.json';
const LIST_URL = 'https://friend.example.com/creators.json';

async function everyone(optOuts: unknown = sampleOptOuts()): Promise<Person[]> {
	const { fetch } = fakeFetch({
		[DEFAULT_RING_URL]: { body: liveRing() },
		[PEOPLE_URL]: { body: sampleList() },
		[LIST_URL]: { body: testSeed() }
	});
	const sources = [
		indieNodesSource({ fetch }),
		yipdenSource({ fetch, url: PEOPLE_URL }),
		listSource({
			fetch,
			id: 'friend',
			name: 'A friend’s picks',
			url: LIST_URL,
			format: 'directory'
		})
	];
	const loaded = await Promise.all(sources.map((source) => source.load()));
	return mergePeople(
		loaded.map((result) => result.people),
		new Set(validateOptOuts(optOuts).hashes)
	);
}

describe('the merged list', () => {
	it('maps the real ring to people, members all', async () => {
		const { fetch } = fakeFetch({ [DEFAULT_RING_URL]: { body: liveRing() } });
		const result = await indieNodesSource({ fetch }).load();
		expect(result.status).toBe('network');
		expect(result.people).toHaveLength(5);
		const nori = result.people.find((person) => person.id === 'indienodes:comic-nori-jammy')!;
		expect(nori).toMatchObject({
			name: expect.any(String),
			listing: 'member',
			source: 'indienodes'
		});
		expect(nori.identities).toContain('url:frammyjammy.com/suzu-and-jack');
	});

	it('never shows anyone who opted out, under any form of their address or account', async () => {
		const people = await everyone();
		const names = people.map((person) => person.name);
		expect(names).not.toContain('Opted Out');
		expect(names).not.toContain('Gone From The Fediverse');
		// The test seed's opted-out example, arriving through a reader's own list, is dropped too:
		// YipDen's opt-outs apply to every source.
		expect(names).not.toContain('Opted Out Example');
	});

	it('honours the test seed’s own opt-out list', async () => {
		const people = await everyone(testSeedOptOuts());
		expect(people.map((person) => person.name)).not.toContain('Opted Out Example');
		expect(people.map((person) => person.name)).toContain('Jericho George');
	});

	it('leaves out anyone hidden by their own source', async () => {
		expect((await everyone()).map((person) => person.name)).not.toContain('Hidden By Choice');
	});

	it('shows one card for one person, preferring the one who opted in', async () => {
		const nori = (await everyone()).filter((person) =>
			person.identities.includes('url:frammyjammy.com/suzu-and-jack')
		);
		expect(nori).toHaveLength(1);
		expect(nori[0]).toMatchObject({ listing: 'member', source: 'indienodes' });
	});

	it('labels each person with where they came from', async () => {
		const people = await everyone();
		const jericho = people.find((person) => person.name === 'Jericho George')!;
		expect(jericho).toMatchObject({
			source: 'list:friend',
			sourceName: 'A friend’s picks',
			listing: 'list'
		});
		expect(jericho.siteUrl).toBe('https://jerichords.carrd.co/');
		expect(jericho.identities).toEqual(
			expect.arrayContaining(['youtube:UCY_lC-yhnqr9M3Umye24TbA', 'youtube:@jerichordsplays'])
		);
		const bluesky = people.find((person) => person.name === 'Bluesky Only')!;
		expect(bluesky).toMatchObject({ listing: 'confirmed', sourceName: 'YipDen' });
		expect(bluesky.siteUrl).toBeUndefined();
	});
});

describe('rotation', () => {
	it('features the same person on the same day whatever order the list arrived in', async () => {
		const people = await everyone();
		const day = new Date('2026-10-14T12:00:00Z');
		const featured = featuredToday(people, day);
		expect(featured).not.toBeNull();
		expect(featuredToday(people.slice().reverse(), day)?.id).toBe(featured!.id);
		expect(featuredToday([], day)).toBeNull();
	});

	it('steps forward and back, wrapping at both ends', async () => {
		const people = await everyone();
		const first = people.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;
		expect(prev(people, next(people, first.id)!.id)?.id).toBe(first.id);
		expect(next(people, prev(people, first.id)!.id)?.id).toBe(first.id);
	});

	it('shuffles the same way for the same seed', async () => {
		const people = await everyone();
		const a = shuffle(people, 'seed').map((person) => person.id);
		expect(shuffle(people, 'seed').map((person) => person.id)).toEqual(a);
		expect([...a].sort()).toEqual(people.map((person) => person.id).sort());
	});
});

describe('filters', () => {
	it('narrows by tag and by what a person can be followed for, across sources', async () => {
		const people = await everyone();
		expect(filterPeople(people, { kind: 'watch' }).map((person) => person.name)).toEqual([
			'Jericho George'
		]);
		expect(
			filterPeople(people, { tags: ['Comic'] }).every((person) => person.tags.includes('comic'))
		).toBe(true);
		const listen = filterPeople(people, { kind: 'listen' });
		expect(listen.every((person) => (person.tracks?.length ?? 0) > 0)).toBe(true);
		expect(tagCounts(people)[0]?.count).toBeGreaterThan(1);
	});
});
