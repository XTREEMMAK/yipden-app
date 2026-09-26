import { describe, expect, it } from 'vitest';
import type { RingEntry } from '@yipden/ring-client';
import { buildListenQueue, queueItemFromYip, queueItemsFromRing, shuffled } from './queue.js';
import type { StoredYip } from './store/index.js';

function yip(overrides: Partial<StoredYip> = {}): StoredYip {
	return {
		key: 'k1',
		id: '1',
		title: 'Low Tide',
		url: 'https://ada.example.com/low-tide',
		publishedAt: '2026-09-20T00:00:00.000Z',
		summary: '',
		contentHtml: null,
		media: [],
		sourceFeedId: 'f',
		personId: 'p1',
		feedKind: 'blog',
		category: 'listen',
		seenAt: '2026-09-20T00:00:00.000Z',
		...overrides
	};
}

function ringEntry(overrides: Partial<RingEntry> = {}): RingEntry {
	return {
		id: 'audio-ada',
		creator: 'Ada Reed',
		type: 'audio',
		source_url: 'https://ada.example.com/',
		...overrides
	};
}

describe('queueItemFromYip', () => {
	it('builds a playable item from a yip with an audio enclosure', () => {
		const item = queueItemFromYip(
			yip({ media: [{ url: 'https://ada.example.com/low-tide.mp3', kind: 'audio' }] })
		);
		expect(item).toMatchObject({
			id: 'k1',
			title: 'Low Tide',
			mediaUrl: 'https://ada.example.com/low-tide.mp3',
			personId: 'p1',
			siteUrl: 'https://ada.example.com/low-tide'
		});
	});

	it('is null for a yip with no audio, whatever else it has', () => {
		expect(queueItemFromYip(yip({ media: [] }))).toBeNull();
		expect(
			queueItemFromYip(yip({ media: [{ url: 'https://ada.example.com/a.jpg', kind: 'image' }] }))
		).toBeNull();
	});

	it('picks the image alongside the audio as art, when there is one', () => {
		const item = queueItemFromYip(
			yip({
				media: [
					{ url: 'https://ada.example.com/low-tide.mp3', kind: 'audio' },
					{ url: 'https://ada.example.com/cover.jpg', kind: 'image' }
				]
			})
		);
		expect(item?.artUrl).toBe('https://ada.example.com/cover.jpg');
	});
});

describe('queueItemsFromRing', () => {
	it('turns every track on every member into one item each', () => {
		const items = queueItemsFromRing([
			ringEntry({
				tracks: [
					{ label: 'Night Drive', media_url: 'https://ada.example.com/night-drive.mp3' },
					{ label: 'Low Tide', media_url: 'https://ada.example.com/low-tide.mp3' }
				]
			})
		]);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ title: 'Night Drive', creator: 'Ada Reed' });
	});

	it('skips a member with no tracks', () => {
		expect(queueItemsFromRing([ringEntry()])).toEqual([]);
	});

	it('falls back to the entry hero image for art when there is one', () => {
		const items = queueItemsFromRing([
			ringEntry({
				thumb_url: 'https://ada.example.com/portrait.jpg',
				tracks: [{ label: 'A track', media_url: 'https://ada.example.com/a.mp3' }]
			})
		]);
		expect(items[0]?.artUrl).toBe('https://ada.example.com/portrait.jpg');
	});
});

describe('buildListenQueue', () => {
	it('puts followed yips first and ring tracks after, matching what Listen shows', () => {
		const queue = buildListenQueue(
			[yip({ media: [{ url: 'https://ada.example.com/low-tide.mp3', kind: 'audio' }] })],
			[ringEntry({ tracks: [{ label: 'Ring Track', media_url: 'https://example.com/r.mp3' }] })]
		);
		expect(queue.map((item) => item.title)).toEqual(['Low Tide', 'Ring Track']);
	});

	it('drops a yip with no audio without breaking the rest of the queue', () => {
		const queue = buildListenQueue(
			[
				yip({ key: 'no-audio', media: [] }),
				yip({ key: 'has-audio', media: [{ url: 'https://ada.example.com/a.mp3', kind: 'audio' }] })
			],
			[]
		);
		expect(queue).toHaveLength(1);
		expect(queue[0]?.id).toBe('has-audio');
	});
});

describe('shuffled', () => {
	it('returns a new array holding the same items, leaving the input alone', () => {
		const input = [1, 2, 3, 4, 5];
		const out = shuffled(input, () => 0.3);
		expect(out).not.toBe(input);
		expect([...out].sort()).toEqual(input);
		expect(input).toEqual([1, 2, 3, 4, 5]);
	});

	it('is deterministic for a given random source, and can leave the order alone', () => {
		expect(shuffled([1, 2, 3], () => 0.999)).toEqual([1, 2, 3]);
		expect(shuffled([1, 2, 3], () => 0)).toEqual(shuffled([1, 2, 3], () => 0));
		expect(shuffled([1, 2], () => 0)).toEqual([2, 1]);
	});

	it('handles empty and single item lists', () => {
		expect(shuffled([])).toEqual([]);
		expect(shuffled(['a'])).toEqual(['a']);
	});
});
