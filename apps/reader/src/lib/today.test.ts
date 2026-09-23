import { describe, expect, it } from 'vitest';
import { formatDuration, relativeAge, sourceLabel } from './today.svelte.js';
import type { StoredYip } from './store/types.js';

describe('relativeAge', () => {
	const now = new Date('2026-09-22T12:00:00.000Z');

	it('returns an empty string for no date', () => {
		expect(relativeAge(null, now)).toBe('');
	});

	it.each([
		['2026-09-22T11:59:30.000Z', 'now'],
		['2026-09-22T11:45:00.000Z', '15m'],
		['2026-09-22T09:00:00.000Z', '3h'],
		['2026-09-20T12:00:00.000Z', '2d'],
		['2026-09-08T12:00:00.000Z', '2w'],
		['2026-06-22T12:00:00.000Z', '3mo'],
		['2024-09-22T12:00:00.000Z', '2y']
	])('formats %s as %s', (iso, expected) => {
		expect(relativeAge(iso, now)).toBe(expected);
	});

	it('never returns a negative age for a clock slightly ahead', () => {
		expect(relativeAge('2026-09-22T12:00:05.000Z', now)).toBe('now');
	});
});

describe('sourceLabel', () => {
	const base: StoredYip = {
		key: 'k',
		id: '1',
		title: 't',
		url: 'https://example.com/1',
		publishedAt: null,
		summary: '',
		contentHtml: null,
		media: [],
		sourceFeedId: 'f',
		personId: 'p',
		feedKind: 'blog',
		category: 'posts',
		seenAt: '2026-01-01T00:00:00.000Z'
	};

	it('labels by feed kind first', () => {
		expect(sourceLabel({ ...base, feedKind: 'bluesky' })).toBe('Bluesky');
		expect(sourceLabel({ ...base, feedKind: 'youtube' })).toBe('YouTube');
		expect(sourceLabel({ ...base, feedKind: 'podcast' })).toBe('Podcast');
	});

	it('falls back to the category for a kind it does not recognize', () => {
		expect(sourceLabel({ ...base, feedKind: 'something-new', category: 'listen' })).toBe('Podcast');
	});
});

describe('formatDuration', () => {
	it('formats minutes and seconds', () => {
		expect(formatDuration(65)).toBe('1:05');
	});

	it('formats hours when there are any', () => {
		expect(formatDuration(3723)).toBe('1:02:03');
	});

	it('returns an empty string for nothing to show', () => {
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(0)).toBe('');
		expect(formatDuration(Number.NaN)).toBe('');
	});
});
