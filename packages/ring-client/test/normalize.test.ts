import { describe, expect, it } from 'vitest';
import live from './fixtures/ring-live.json' with { type: 'json' };
import { heroImage, normalize } from '../src/normalize.js';
import type { RingEntry } from '../src/types.js';

const entries = live.entries as unknown as RingEntry[];
const byId = (id: string) => entries.find((entry) => entry.id === id) as RingEntry;

/** exactOptionalPropertyTypes means an absent field is absent, not set to undefined. */
function withoutThumb(entry: RingEntry): RingEntry {
	const copy = { ...entry };
	delete copy.thumb_url;
	return copy;
}

describe('normalize', () => {
	it('resolves a redirect so one person is one person', () => {
		const entry = normalize(
			{ ...byId('audio-key-jay'), source_url: 'https://neo.keyjayonline.com/' },
			{
				resolveUrl: (url) =>
					url.includes('neo.keyjayonline') ? 'https://keyjay.neocities.org/' : url
			}
		);
		expect(entry.source_url).toBe('https://keyjay.neocities.org/');
	});

	it('leaves a URL alone when nothing resolved it', () => {
		expect(normalize(byId('audio-key-jay')).source_url).toBe('https://keyjay.neocities.org/');
	});

	it('empties source_url rather than passing an unsafe one on', () => {
		expect(
			normalize({ ...byId('audio-key-jay'), source_url: 'javascript:alert(1)' }).source_url
		).toBe('');
	});

	it('folds feeds that resolve to the same address', () => {
		const entry = normalize(
			{
				...byId('audio-key-jay'),
				feeds: [
					{ type: 'rss', url: 'https://neo.keyjayonline.com/feed.xml' },
					{ type: 'rss', url: 'https://keyjay.neocities.org/feed.xml', verified: true }
				]
			},
			{ resolveUrl: (url) => url.replace('neo.keyjayonline.com', 'keyjay.neocities.org') }
		);
		expect(entry.feeds).toHaveLength(1);
	});

	it('keeps unknown fields untouched', () => {
		const entry = normalize({ ...byId('audio-key-jay'), some_future_field: [1, 2, 3] });
		expect(entry.some_future_field).toEqual([1, 2, 3]);
	});

	it('drops an empty why rather than rendering a blank line', () => {
		expect(normalize({ ...byId('audio-key-jay'), why: '   ' }).why).toBeUndefined();
	});
});

describe('heroImage', () => {
	it('uses the thumb when there is one', () => {
		expect(heroImage(normalize(byId('audio-key-jay')))).toContain('keyjay.neocities.org');
	});

	it('falls back to the first artwork for a member with no thumb', () => {
		const entry = normalize(byId('art-slime-pond'));
		expect(entry.thumb_url).toBeUndefined();
		expect(heroImage(entry)).toBe(entry.artworks?.[0]?.image_url);
	});

	it('falls back to the first page for a comic with no thumb', () => {
		const comic = normalize(withoutThumb(byId('comic-nori-jammy')));
		expect(heroImage(comic)).toBe(comic.pages?.[0]?.image_url);
	});

	it('returns null when there is nothing to paint, so the caller draws its own wash', () => {
		expect(heroImage(normalize(withoutThumb(byId('audio-key-jay'))))).toBeNull();
	});
});
