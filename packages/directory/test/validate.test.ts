import { describe, expect, it } from 'vitest';
import { validateDirectory, validateOptOuts } from '../src/index.js';
import { sampleList, testSeed } from './helpers.js';

describe('a directory document', () => {
	const { document, dropped, repaired } = validateDirectory(sampleList());
	const ids = document.entries.map((entry) => entry.id);

	it('drops bad entries one at a time and keeps the rest', () => {
		expect(ids).toEqual([
			'nori-again',
			'opted-out',
			'fedi-gone',
			'hidden',
			'bluesky-only',
			'bad-thumb'
		]);
		expect(dropped.map((entry) => entry.id)).toEqual(['no-name', 'Bad Id', 'http-only']);
		expect(dropped.find((entry) => entry.id === 'http-only')?.reason).toBe(
			'no site and no feed to follow'
		);
	});

	it('removes a bad field from a good entry and says so', () => {
		const bad = document.entries.find((entry) => entry.id === 'bad-thumb')!;
		expect(bad.thumb_url).toBeUndefined();
		expect(bad.listing).toBeUndefined();
		expect(repaired.filter((entry) => entry.id === 'bad-thumb')).toHaveLength(2);
	});

	it('reads a cover position in percent, as the ring does, and drops one out of range', () => {
		const entry = (id: string, thumb_position: unknown) => ({
			id,
			name: id,
			site_url: `https://${id}.example.com/`,
			thumb_position
		});
		const { document, repaired } = validateDirectory({
			version: '1.0',
			entries: [entry('placed', { x: 78, y: 35 }), entry('too-far', { x: 140, y: 50 })]
		});
		expect(document.entries[0]?.thumb_position).toEqual({ x: 78, y: 35 });
		expect(document.entries[1]?.thumb_position).toBeUndefined();
		expect(repaired.map((r) => r.id)).toEqual(['too-far']);
	});

	it('accepts a person with no website, and keeps fields it does not know', () => {
		const only = document.entries.find((entry) => entry.id === 'bluesky-only')!;
		expect(only.site_url).toBeUndefined();
		expect(only.feeds?.[0]?.verified).toBe(true);
		expect(only.tags).toEqual(['photography']);
		expect(only.future_field).toEqual({ kept: true });
	});

	it('reads nothing from something that is not a directory, rather than throwing', () => {
		expect(validateDirectory('nope').document.entries).toEqual([]);
		expect(validateDirectory({ entries: 'nope' }).document.entries).toEqual([]);
	});

	it('reads the test seed in full', () => {
		expect(validateDirectory(testSeed()).document.entries.map((entry) => entry.id)).toEqual([
			'jericho-george',
			'opted-out-example'
		]);
	});
});

describe('an opt-out document', () => {
	it('keeps only well-formed hashes', () => {
		const hash = 'a'.repeat(64);
		expect(validateOptOuts({ version: '1.0', hashes: [hash, 'short', 3] }).hashes).toEqual([hash]);
		expect(validateOptOuts(null).hashes).toEqual([]);
	});
});
