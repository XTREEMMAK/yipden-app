import { describe, expect, it } from 'vitest';
import extended from './fixtures/ring-extended.json' with { type: 'json' };
import { validate } from '../src/validate.js';
import { filterRing, tagFacets, typeFacets } from '../src/filter.js';

const ring = validate(extended).document;

describe('filterRing', () => {
	it('hides self declared explicit members unless the reader opts in', () => {
		expect(filterRing(ring).map((e) => e.id)).not.toContain('comic-nori-jammy');
		expect(filterRing(ring, { includeExplicit: true }).map((e) => e.id)).toContain(
			'comic-nori-jammy'
		);
	});

	it('filters by type', () => {
		expect(filterRing(ring, { types: ['audio'] }).every((entry) => entry.type === 'audio')).toBe(
			true
		);
	});

	it('filters by form', () => {
		expect(filterRing(ring, { forms: ['music'] })).not.toHaveLength(0);
		expect(filterRing(ring, { forms: ['spoken'] })).toHaveLength(0);
	});

	it('matches any tag by default and every tag on request', () => {
		expect(filterRing(ring, { tags: ['vgm', 'nothing-has-this'] })).not.toHaveLength(0);
		expect(filterRing(ring, { tags: ['vgm', 'nothing-has-this'], tagMode: 'all' })).toHaveLength(0);
	});

	it('matches tags without caring about case', () => {
		expect(filterRing(ring, { tags: ['VGM'] })).toEqual(filterRing(ring, { tags: ['vgm'] }));
	});

	it('returns everything discoverable when given no filter', () => {
		expect(filterRing(ring)).toHaveLength(ring.entries.filter((e) => !e.explicit).length);
	});
});

describe('facets', () => {
	it('counts tags, most used first', () => {
		const facets = tagFacets(ring);
		expect(facets[0]?.count).toBeGreaterThanOrEqual(facets[facets.length - 1]?.count ?? 0);
		expect(facets.find((facet) => facet.tag === 'vgm')?.count).toBeGreaterThan(0);
	});

	it('counts types', () => {
		expect(typeFacets(ring).find((facet) => facet.type === 'audio')?.count).toBe(2);
	});
});
