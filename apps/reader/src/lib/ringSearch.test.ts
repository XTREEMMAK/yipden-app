import { describe, expect, it } from 'vitest';
import type { RingEntry } from '@yipden/ring-client';
import { discoveryFromRing, isExactRingMatch, searchRing } from './ringSearch.js';

const entries: RingEntry[] = [
	{
		id: 'ada-reed',
		creator: 'Ada Reed',
		type: 'audio',
		tags: ['synth', 'music'],
		source_url: 'https://ada.example.com/',
		feeds: [
			{ type: 'rss', url: 'https://ada.example.com/feed.xml', verified: true },
			{ type: 'bluesky', url: 'https://bsky.app/profile/ada/rss' }
		]
	},
	{
		id: 'bo-quill',
		creator: 'Bo Quill',
		type: 'comic',
		source_url: 'https://bo.example.com/'
	}
];

describe('Ring search for Follow', () => {
	it('matches names, tags, site hosts and declared feed hosts locally', () => {
		expect(searchRing(entries, 'ada')[0]?.id).toBe('ada-reed');
		expect(searchRing(entries, 'synth')[0]?.id).toBe('ada-reed');
		expect(searchRing(entries, 'bo.example.com')[0]?.id).toBe('bo-quill');
		expect(searchRing(entries, 'bsky.app')[0]?.id).toBe('ada-reed');
	});

	it('does not offer noisy one-character matches', () => {
		expect(searchRing(entries, 'a')).toEqual([]);
	});

	it('recognizes an exact creator or site submission', () => {
		expect(isExactRingMatch(entries[0]!, 'Ada Reed')).toBe(true);
		expect(isExactRingMatch(entries[0]!, 'https://ada.example.com/')).toBe(true);
		expect(isExactRingMatch(entries[0]!, 'Ada')).toBe(false);
	});

	it('adapts Ring feeds without claiming unverified ownership', () => {
		const result = discoveryFromRing(entries[0]!);
		expect(result.title).toBe('Ada Reed');
		expect(result.feeds.map((feed) => feed.kind)).toEqual(['blog', 'bluesky']);
		expect(result.feeds.map((feed) => feed.verified)).toEqual([true, false]);
	});
});
