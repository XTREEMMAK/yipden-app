import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { creators, homeKindOf, strongestHome } from './creators.svelte.js';
import { store } from './store/index.js';

beforeEach(async () => {
	await creators.load();
	for (const record of await store.listCreators()) await store.removeCreator(record.id);
	creators.records = [];
});

describe('homeKindOf', () => {
	it('ranks their own domain over a hand-made hosted site over open and closed profiles', () => {
		expect(homeKindOf('https://lenaofori.com/')).toBe('own-site');
		expect(homeKindOf('https://lena.neocities.org/')).toBe('hosted-site');
		expect(homeKindOf('https://lena.github.io/')).toBe('hosted-site');
		expect(homeKindOf('https://bsky.app/profile/lena.example')).toBe('open-profile');
		expect(homeKindOf('https://mastodon.social/@lena')).toBe('open-profile');
		expect(homeKindOf('https://www.instagram.com/lena')).toBe('closed-profile');
		expect(homeKindOf('https://lena.bandcamp.com/')).toBe('closed-profile');
		// The host's own front page is nobody's home.
		expect(homeKindOf('https://neocities.org/')).toBe('closed-profile');
	});

	it('picks the strongest of several, the first when two are as strong', () => {
		expect(
			strongestHome([
				'https://www.instagram.com/lena',
				'https://bsky.app/profile/lena.example',
				'https://lena.neocities.org/'
			])
		).toBe('https://lena.neocities.org/');
		expect(strongestHome(['https://a.example/', 'https://b.example/'])).toBe('https://a.example/');
		expect(strongestHome([])).toBeNull();
	});
});

describe('one creator, several addresses', () => {
	const BSKY = 'https://bsky.app/profile/lena.example';
	const SITE = 'https://lenaofori.com/';
	const INSTA = 'https://www.instagram.com/lena';

	it('keeps the first address as the id, and makes the strongest address home', async () => {
		const record = await creators.merge(BSKY, SITE);
		expect(record).toMatchObject({
			id: 'bsky.app/profile/lena.example',
			home: SITE,
			homeKind: 'own-site'
		});
		expect(creators.idFor(SITE)).toBe('bsky.app/profile/lena.example');
		expect(creators.idFor(BSKY)).toBe('bsky.app/profile/lena.example');
		expect(creators.addressesFor(BSKY)).toEqual([SITE, BSKY]);
		expect(await store.listCreators()).toHaveLength(1);
	});

	it('brings along what the other was already linked to, leaving one record', async () => {
		await creators.merge(SITE, INSTA);
		await creators.merge(BSKY, 'https://lena.neocities.org/');
		await creators.merge(SITE, BSKY);
		expect(creators.records).toHaveLength(1);
		expect(creators.idFor('https://lena.neocities.org/')).toBe('lenaofori.com');
		expect(creators.addressesFor(SITE).sort()).toEqual(
			[SITE, INSTA, BSKY, 'https://lena.neocities.org/'].sort()
		);
		expect(await store.listCreators()).toHaveLength(1);
	});

	it('does nothing for an address already theirs, or one that is not safe', async () => {
		await creators.merge(SITE, BSKY);
		expect(await creators.merge(BSKY, SITE)).toBeNull();
		expect(await creators.merge(SITE, 'javascript:alert(1)')).toBeNull();
	});

	it('unlinks an address, and forgets the record when nothing is left linked', async () => {
		await creators.merge(BSKY, SITE);
		await creators.merge(BSKY, INSTA);
		await creators.unlink(SITE);
		expect(creators.idFor(SITE)).toBe('lenaofori.com');
		expect(creators.homeFor(BSKY)).toBe(BSKY);
		await creators.unlink(INSTA);
		expect(creators.records).toEqual([]);
		expect(await store.listCreators()).toEqual([]);
	});

	it('keeps a home the reader chose over a stronger one linked later', async () => {
		await creators.merge(SITE, BSKY);
		await creators.chooseHome(SITE, BSKY);
		await creators.merge(SITE, 'https://lena.neocities.org/');
		expect(creators.homeFor(SITE)).toBe(BSKY);
		expect(creators.recordFor(SITE)?.homeChosen).toBe(true);
	});

	it('refuses a home that is not one of their addresses', async () => {
		await creators.chooseHome(SITE, 'https://someone-else.example/');
		expect(creators.records).toEqual([]);
	});
});
