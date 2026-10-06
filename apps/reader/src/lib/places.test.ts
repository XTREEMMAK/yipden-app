import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedHttp, type FetchLike } from '@yipden/feeds';
import type { SiteFacts } from './creatorProfile.svelte.js';
import { places, roleOf } from './places.svelte.js';
import { store } from './store/index.js';

const SITE = 'https://lenaofori.com/';
const KEY = 'lenaofori.com';
const MASTODON = 'https://mastodon.social/@lena';
const ETSY = 'https://www.etsy.com/shop/lenaofori';

function facts(named: string[], linked: string[] = []): SiteFacts {
	return {
		name: 'Lena',
		cardName: 'Lena',
		bio: null,
		photoUrl: null,
		iconUrl: null,
		places: named.map((url) => ({ url, label: url })),
		linked: linked.map((url) => url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''))
	};
}

function pages(bodies: Record<string, string>): FetchLike {
	return async (url) => ({
		status: bodies[url] ? 200 : 404,
		url,
		headers: { get: () => null },
		text: async () => bodies[url] ?? ''
	});
}

beforeEach(async () => {
	await places.load();
	for (const record of await store.listPlaces()) await store.removePlace(record.id);
	places.records = [];
});

describe('roleOf', () => {
	it('tells a shop, support, commissions and a profile apart by address', () => {
		expect(roleOf(ETSY)).toBe('shop');
		expect(roleOf('https://lena.itch.io/')).toBe('shop');
		expect(roleOf('https://ko-fi.com/lena')).toBe('support');
		expect(roleOf('https://vgen.co/lena')).toBe('commissions');
		expect(roleOf('https://lenaofori.com/commissions')).toBe('commissions');
		expect(roleOf(MASTODON)).toBe('profile');
	});
});

describe('places from their site', () => {
	it('records what their site names as theirs, and ranks it above the reader’s word', async () => {
		await places.add(KEY, 'https://bsky.app/profile/lena.example', 'profile', facts([]));
		await places.syncFromSite(KEY, facts([MASTODON, ETSY]));
		const listed = places.placesFor(new Set([KEY]));
		expect(listed.map((place) => [place.url, place.evidence, place.role])).toEqual([
			[MASTODON, 'their-site', 'profile'],
			[ETSY, 'their-site', 'shop'],
			['https://bsky.app/profile/lena.example', 'you', 'profile']
		]);
	});

	it('drops a place their site stopped naming, keeping one it still links', async () => {
		await places.syncFromSite(KEY, facts([MASTODON, ETSY]));
		await places.syncFromSite(KEY, facts([], [ETSY]));
		expect(places.placesFor(new Set([KEY])).map((p) => [p.url, p.evidence])).toEqual([
			[ETSY, 'their-page']
		]);
	});

	it('marks a place linked both ways once its own page names their site back', async () => {
		await places.syncFromSite(KEY, facts([MASTODON, ETSY]));
		places.http = new FeedHttp({
			fetch: pages({
				'https://mastodon.social/robots.txt': 'User-agent: *\nAllow: /',
				[MASTODON]: `<a rel="me" href="${SITE}">site</a>`,
				'https://www.etsy.com/robots.txt': 'User-agent: *\nAllow: /',
				[ETSY]: '<p>no link back</p>'
			}),
			minHostIntervalMs: 0
		});
		await places.verify(KEY, [SITE]);
		const byUrl = new Map(places.placesFor(new Set([KEY])).map((p) => [p.url, p]));
		expect(byUrl.get(MASTODON)?.evidence).toBe('two-way');
		expect(byUrl.get(ETSY)?.evidence).toBe('their-site');
		expect(byUrl.get(ETSY)?.checkedAt).toBeTruthy();
	});
});

describe('the reader’s own say', () => {
	it('records what they add at the strength their site gives it', async () => {
		const linked = await places.add(KEY, ETSY, 'shop', facts([], [ETSY]));
		const own = await places.add(KEY, 'https://lena.example.net/', 'site', facts([]));
		expect(linked?.evidence).toBe('their-page');
		expect(own?.evidence).toBe('you');
		expect(await places.add(KEY, 'javascript:alert(1)', 'profile', null)).toBeNull();
	});

	it('removes their own, and hides one their site names so it does not come back', async () => {
		await places.syncFromSite(KEY, facts([MASTODON]));
		const own = await places.add(KEY, ETSY, 'shop', facts([MASTODON]));
		const named = places.placesFor(new Set([KEY])).find((p) => p.url === MASTODON)!;
		await places.remove(own!);
		await places.remove(named);
		await places.syncFromSite(KEY, facts([MASTODON]));
		expect(places.placesFor(new Set([KEY]))).toEqual([]);
		expect((await store.listPlaces()).map((p) => [p.url, p.hidden ?? false])).toEqual([
			[MASTODON, true]
		]);
	});
});
