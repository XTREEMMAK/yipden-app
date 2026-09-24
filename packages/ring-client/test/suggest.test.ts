import { describe, expect, it } from 'vitest';
import type { RingEntry } from '../src/types.js';
import { suggestNextEntry } from '../src/suggest.js';

function entry(overrides: Partial<RingEntry> & Pick<RingEntry, 'id'>): RingEntry {
	return {
		creator: overrides.id,
		type: 'audio',
		source_url: `https://${overrides.id}.example.com/`,
		form: 'music',
		tags: [],
		tracks: [{ label: 'A track', media_url: `https://example.com/${overrides.id}.mp3` }],
		...overrides
	};
}

const ada = entry({ id: 'ada', tags: ['synth', 'vgm'] });
const bo = entry({ id: 'bo', tags: ['synth', 'lofi'] });
const cass = entry({ id: 'cass', tags: ['folk'] });
const dev = entry({ id: 'dev', form: 'spoken', tags: ['synth'] });
const noTracks = entry({ id: 'no-tracks', tags: ['synth'], tracks: [] });
const ring = [ada, bo, cass, dev, noTracks];

describe('suggestNextEntry', () => {
	it('prefers the candidate sharing the most tags with everything played so far', () => {
		// ada shares one tag with bo (synth) and none with cass, so bo wins outright.
		expect(suggestNextEntry(ring, [ada])?.id).toBe('bo');
	});

	it('scores against every played member, not just the most recent one', () => {
		// Once ada and bo are both played, cass (folk) has nothing left to lose to.
		expect(suggestNextEntry(ring, [ada, bo])?.id).toBe('cass');
	});

	it('never suggests an already played member', () => {
		const suggestion = suggestNextEntry(ring, [ada, bo, cass]);
		expect(['ada', 'bo', 'cass']).not.toContain(suggestion?.id);
	});

	it('stays on the form the session started with', () => {
		// dev (spoken) shares "synth" with ada but must never be suggested to a music session.
		expect(suggestNextEntry(ring, [ada, bo, cass])?.id).not.toBe('dev');
	});

	it('skips members with no tracks to actually play', () => {
		expect(suggestNextEntry(ring, [ada, bo, cass, dev])).toBeNull();
	});

	it('returns null once nothing is left to suggest', () => {
		expect(suggestNextEntry([ada], [ada])).toBeNull();
	});

	it('breaks a tie using the injected random source', () => {
		const tied = [entry({ id: 'x' }), entry({ id: 'y' })];
		expect(suggestNextEntry(tied, [], { random: () => 0 })?.id).toBe('x');
		expect(suggestNextEntry(tied, [], { random: () => 0.99 })?.id).toBe('y');
	});
});
