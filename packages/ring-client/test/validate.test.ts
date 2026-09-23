import { describe, expect, it } from 'vitest';
import live from './fixtures/ring-live.json' with { type: 'json' };
import extended from './fixtures/ring-extended.json' with { type: 'json' };
import hostile from './fixtures/ring-hostile.json' with { type: 'json' };
import { validate } from '../src/validate.js';

describe('validate against the live ring', () => {
	it('keeps every published member', () => {
		const result = validate(live);
		expect(result.document.entries).toHaveLength(live.entries.length);
		expect(result.dropped).toEqual([]);
	});

	it('reads the envelope version', () => {
		expect(validate(live).document.version).toBe('1.0');
	});

	it('gives every member the optionals the app reads without a guard', () => {
		for (const entry of validate(live).document.entries) {
			expect(Array.isArray(entry.tags)).toBe(true);
			expect(entry.thumb_position).toEqual(expect.objectContaining({ x: expect.any(Number) }));
			expect(entry.discoverable).toBe(true);
			expect(entry.explicit).toBe(false);
		}
	});
});

describe('validate against a ring carrying the additive fields', () => {
	it('reads generated_at and feeds', () => {
		const result = validate(extended);
		expect(result.document.generated_at).toBe('2026-09-22T17:32:39.000Z');
		const keyjay = result.document.entries.find((entry) => entry.id === 'audio-key-jay');
		expect(keyjay?.feeds).toHaveLength(3);
		expect(keyjay?.feeds?.[1]).toEqual({
			type: 'bluesky',
			url: 'https://bsky.app/profile/keyjay.bsky.social/rss',
			verified: true
		});
	});

	it('carries a field this client does not model through untouched', () => {
		const keyjay = validate(extended).document.entries.find((e) => e.id === 'audio-key-jay');
		expect(keyjay?.future_field).toEqual({ note: 'a field this client does not model yet' });
	});

	it('keeps an undiscoverable member in the document for anyone holding a direct link', () => {
		const george = validate(extended).document.entries.find(
			(e) => e.id === 'audio-george-r-powell'
		);
		expect(george?.discoverable).toBe(false);
	});
});

describe('validate against hostile input', () => {
	const result = validate(hostile);
	const ids = result.document.entries.map((entry) => entry.id);

	it('keeps the sound entries and drops the rest individually', () => {
		expect(ids).toEqual(['good-entry', 'unicode-host']);
	});

	const reasonFor = (id: string, index?: number) =>
		result.dropped.find((item) => item.id === id && (index === undefined || item.index === index))
			?.reason;

	it.each([
		['javascript-source', 'source_url'],
		['loopback-source', 'source_url'],
		['credentials-source', 'source_url'],
		['Not A Slug', 'malformed id'],
		['no-creator', 'missing creator']
	])('reports why it dropped %s', (id, fragment) => {
		expect(reasonFor(id)).toContain(fragment);
	});

	it('reports the second good-entry as a duplicate id', () => {
		expect(reasonFor('good-entry', 4)).toBe('duplicate id');
	});

	it('strips unusable tracks without losing the entry', () => {
		const entry = result.document.entries.find((item) => item.id === 'good-entry');
		expect(entry?.tracks).toHaveLength(1);
		expect(entry?.tracks?.[0]?.label).toBe('Kept');
		expect(result.repaired.some((item) => item.reason.includes('tracks'))).toBe(true);
	});

	it('clamps an out of range focal point instead of dropping the member', () => {
		const entry = result.document.entries.find((item) => item.id === 'good-entry');
		expect(entry?.thumb_position).toEqual({ x: 100, y: 0 });
	});

	it('folds duplicate and blank tags', () => {
		const entry = result.document.entries.find((item) => item.id === 'good-entry');
		expect(entry?.tags).toEqual(['music', 'vgm']);
	});

	it('survives entries that are not objects', () => {
		expect(result.dropped.filter((item) => item.reason.includes('not an object'))).toHaveLength(2);
	});
});

describe('validate against a broken document', () => {
	it('returns an empty ring rather than throwing', () => {
		expect(validate(null).document.entries).toEqual([]);
		expect(validate('nope').dropped[0]?.reason).toContain('not an object');
		expect(validate([]).dropped[0]?.reason).toContain('not an object');
	});

	it('reports a missing entries array', () => {
		const result = validate({ version: '1.0' });
		expect(result.document.entries).toEqual([]);
		expect(result.dropped[0]?.reason).toContain('no entries array');
	});

	it('stops reading past the entry cap', () => {
		const entries = Array.from({ length: 50 }, (_unused, index) => ({
			id: `member-${index}`,
			creator: `Member ${index}`,
			type: 'text',
			source_url: 'https://example.com/'
		}));
		const result = validate({ version: '1.0', entries }, { maxEntries: 10 });
		expect(result.document.entries).toHaveLength(10);
		expect(result.dropped[0]?.reason).toContain('exceeds 10');
	});
});
