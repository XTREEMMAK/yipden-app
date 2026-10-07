import { describe, expect, it } from 'vitest';
import seed from './seed.json';
import { MAX_SITES, validateSites } from './validate.js';

const site = (overrides: Record<string, unknown> = {}) => ({
	id: 'a-site',
	url: 'https://a.example/',
	title: 'A site',
	category: 'shrines',
	...overrides
});
const doc = (...entries: unknown[]) => ({ version: '0.1', entries });

describe('validateSites', () => {
	it('reads the bundled seed whole', () => {
		const { document, dropped } = validateSites(seed, { localMedia: true });
		expect(dropped).toEqual([]);
		expect(document.entries).toHaveLength(seed.entries.length);
	});

	it('fills in what every caller reads, and keeps unknown fields', () => {
		const { document } = validateSites(
			doc(site({ shiny: { new: true }, tags: ['Fandom:Sonic', 'fandom:sonic'] }))
		);
		const entry = document.entries[0]!;
		expect(entry.tags).toEqual(['fandom:sonic']);
		expect(entry.explicit).toBe(false);
		expect(entry.shiny).toEqual({ new: true });
		expect('layout' in entry).toBe(false);
	});

	it('drops an entry it cannot show, with a reason, and keeps the rest', () => {
		const { document, dropped } = validateSites(
			doc(
				site({ id: 'Bad Id' }),
				site({ id: 'plain-http', url: 'http://a.example/' }),
				site({ id: 'private', url: 'https://localhost/' }),
				site({ id: 'no-title', title: ' ' }),
				site({ id: 'no-category', category: undefined }),
				'not an object',
				site(),
				site()
			)
		);
		expect(document.entries.map((entry) => entry.id)).toEqual(['a-site']);
		expect(dropped.map((drop) => drop.reason)).toEqual([
			'missing or malformed id',
			'url is missing, not https, or not public',
			'url is missing, not https, or not public',
			'missing title',
			'missing category',
			'entry is not an object',
			'duplicate id'
		]);
	});

	it('takes bundled media paths only from the bundled seed', () => {
		const local = site({ poster_url: '/sites/a-site.jpg', preview_url: '/sites/../x.webm' });
		expect(validateSites(doc(local)).document.entries[0]!.poster_url).toBeUndefined();
		const bundled = validateSites(doc(local), { localMedia: true }).document.entries[0]!;
		expect(bundled.poster_url).toBe('/sites/a-site.jpg');
		expect(bundled.preview_url).toBeUndefined();
	});

	it('keeps only https media, feeds and a known layout', () => {
		const { document } = validateSites(
			doc(
				site({
					poster_url: 'javascript:alert(1)',
					preview_url: 'https://media.example/a.mp4',
					feeds: [{ url: 'https://a.example/feed.xml' }, { url: 'http://a.example/x' }],
					layout: 'sideways',
					explicit: 'yes'
				})
			)
		);
		const entry = document.entries[0]!;
		expect(entry.poster_url).toBeUndefined();
		expect(entry.preview_url).toBe('https://media.example/a.mp4');
		expect(entry.feeds).toEqual([{ type: 'rss', url: 'https://a.example/feed.xml' }]);
		expect('layout' in entry).toBe(false);
		expect(entry.explicit).toBe(false);
	});

	it('never throws on a document of the wrong shape, and caps a huge one', () => {
		expect(validateSites(null).document.entries).toEqual([]);
		expect(validateSites([]).dropped[0]!.reason).toBe('document is not an object');
		expect(validateSites({ entries: 'nope' }).dropped[0]!.reason).toBe(
			'document has no entries array'
		);
		const many = Array.from({ length: MAX_SITES + 5 }, (_, i) => site({ id: `s-${i}` }));
		const { document, dropped } = validateSites(doc(...many));
		expect(document.entries).toHaveLength(MAX_SITES);
		expect(dropped[0]!.reason).toMatch(/exceeds/);
	});
});
