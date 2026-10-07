import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPartnerRing } from '@yipden/ring-client';
import { webringTheMusicSource } from './webringTheMusic.js';
import { smallwayComicsSource } from './smallwayComics.js';
import { inkShrinesSource } from './inkShrines.js';
import { webcomicQuestSource } from './webcomicQuest.js';
import { homebrewSource } from './homebrewWebring.js';

/**
 * The five rings added on 2026-10-07, each against a real capture of its own page or file (taken
 * that day), through the same boundary every partner ring crosses. The counts were checked by
 * hand against the captures, not guessed at.
 */
const capture = (name: string) =>
	readFileSync(join(import.meta.dirname, 'test-fixtures', name), 'utf8');

describe('WeBringTheMusic, from its directory', () => {
	const ring = readPartnerRing(
		webringTheMusicSource.adapter,
		capture('webringthemusic-directory.html')
	);

	it('reads every artist, with their site, their words and their Bandcamp as a sample', () => {
		expect(ring.members).toHaveLength(29);
		const combover = ring.members.find((member) => member.name === 'Combover Beethoven');
		expect(combover).toMatchObject({
			url: 'https://comboverbeethoven.com/',
			previewUrl: 'https://comboverbeethoven.bandcamp.com/'
		});
		expect(combover?.blurb).toMatch(/^Guitartronica/);
	});
});

describe('Smallway: Comics Line, from its script, read as text', () => {
	const ring = readPartnerRing(smallwayComicsSource.adapter, capture('smallway-comics.js'));

	it('reads the stops on the line, adding the scheme their addresses leave out', () => {
		expect(ring.members.length).toBeGreaterThan(10);
		expect(ring.members.find((member) => member.name === 'Trailerparkia')).toMatchObject({
			url: 'https://trailerparkia.net/',
			blurb: 'By Em'
		});
	});

	it('leaves out a stop taken off the line by commenting it out', () => {
		expect(ring.members.some((member) => member.name === 'Bruno and Friends')).toBe(false);
	});

	it('finds the array before the widget code that follows it in the same file', () => {
		expect(
			smallwayComicsSource.adapter.read(
				'let DATA_comics = [{"title":"A","url":"a.example/"}];\nfunction x(){ return [1,[2]]; }'
			)
		).toEqual([{ name: 'A', url: 'https://a.example/' }]);
	});
});

describe('Ink Shrines, from its home page', () => {
	const ring = readPartnerRing(inkShrinesSource.adapter, capture('inkshrines.html'));

	it('reads each cartoonist with their picture and genre, dropping plain http sites', () => {
		expect(ring.members).toHaveLength(19);
		expect(ring.dropped.filter((drop) => /not https/.test(drop.reason))).toHaveLength(24);
		expect(ring.members[0]).toMatchObject({
			name: 'Kel McDonald',
			url: 'https://kelmcdonald.com/comics/',
			tags: ['fantasy'],
			thumbUrl: 'https://www.inkshrines.sloanesloane.com/images/kel.png'
		});
	});

	it('takes their own site, never their Patreon or social profile', () => {
		expect(
			ring.members.every(
				(member) => !/patreon|twitter|instagram/.test(new URL(member.url).hostname)
			)
		).toBe(true);
	});
});

describe('WebcomicQuest, from its member gallery', () => {
	const ring = readPartnerRing(webcomicQuestSource.adapter, capture('webcomic-quest.html'));

	it('reads each comic with its name and picture', () => {
		expect(ring.members).toHaveLength(15);
		expect(ring.members[0]).toMatchObject({
			name: 'The Titan',
			url: 'https://titancomic.net/'
		});
		expect(ring.members[0]?.thumbUrl).toMatch(/^https:\/\/webcomic\.quest\//);
	});
});

describe('The Homebrew Webring, from members.json', () => {
	const ring = readPartnerRing(homebrewSource.adapter, capture('homebrew-members.json'));

	it('reads each member with their button and their own words', () => {
		expect(ring.members).toHaveLength(63);
		expect(ring.members[0]).toMatchObject({
			name: 'beigestack',
			url: 'https://maniksharma.xyz/',
			thumbUrl: 'https://homebrew.cresentri.com/buttons/65.png'
		});
	});

	it('reads nothing from a document that is not its JSON, rather than throwing', () => {
		expect(homebrewSource.adapter.read('<html>')).toEqual([]);
		expect(homebrewSource.adapter.read('{"members": 3}')).toEqual([]);
	});
});
