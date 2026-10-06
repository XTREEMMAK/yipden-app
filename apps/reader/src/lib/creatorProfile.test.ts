import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { placeLabel, placesFrom, profileHref } = await import('./creatorProfile.svelte.js');

describe('a creator’s places', () => {
	it('names a known platform, with its kind for the color, and anything else by its host', () => {
		expect(placeLabel('https://bsky.app/profile/lena.example')).toEqual({
			label: 'Bluesky',
			kind: 'bluesky'
		});
		expect(placeLabel('https://mastodon.social/@lena')).toEqual({
			label: 'Mastodon',
			kind: 'mastodon'
		});
		expect(placeLabel('https://www.instagram.com/lena')).toEqual({ label: 'Instagram' });
		expect(placeLabel('https://lena.itch.io/')).toEqual({ label: 'itch.io' });
		expect(placeLabel('https://zines.lena.example/')).toEqual({ label: 'zines.lena.example' });
	});

	it('lists what their site links as theirs once each, never the site itself or an unsafe link', () => {
		const places = placesFrom(
			[
				'https://lena.example/',
				'https://bsky.app/profile/lena.example',
				'https://bsky.app/profile/lena.example/',
				'javascript:alert(1)',
				'http://insecure.example/',
				'https://lena.bandcamp.com/'
			],
			'https://lena.example/'
		);
		expect(places.map((place) => place.label)).toEqual(['Bluesky', 'Bandcamp']);
	});

	it('opens at an address that carries the site', () => {
		expect(profileHref('https://lena.example/')).toBe(
			'/creator/?site=https%3A%2F%2Flena.example%2F'
		);
	});
});
