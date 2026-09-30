import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `loadAndCatchUp` only needs to know which feed ids `refreshAll` was actually asked for, not
 * for it to really fetch anything: a real `refreshAll` would reach the network, which this file
 * has no business doing to test what `FeedsState` scopes its own catch-up refresh to.
 */
const refreshCalls: Array<{ feedIds?: string[] }> = [];
vi.mock('./refresh.js', () => ({
	refreshAll: async (options: { feedIds?: string[] } = {}) => {
		refreshCalls.push(options);
		return { feeds: [], added: 0 };
	}
}));

import {
	displayAuthor,
	feeds,
	formatDuration,
	mediaDuration,
	relativeAge,
	sourceLabel
} from './feeds.svelte.js';
import { store } from './store/index.js';
import type { Feed, Person, StoredYip } from './store/types.js';

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
		expect(sourceLabel({ ...base, feedKind: 'peertube' })).toBe('PeerTube');
	});

	it('falls back to the category for a kind it does not recognize', () => {
		expect(sourceLabel({ ...base, feedKind: 'something-new', category: 'listen' })).toBe('Podcast');
	});
});

describe('displayAuthor', () => {
	it('keeps a multi-author feed item byline ahead of the followed publication', () => {
		expect(displayAuthor({ author: 'Topic Author' }, 'Followed Forum')).toBe('Topic Author');
		expect(displayAuthor({}, 'Followed Forum')).toBe('Followed Forum');
	});
});

describe('mediaDuration', () => {
	it('finds the playable attachment when a thumbnail comes first', () => {
		expect(
			mediaDuration({
				category: 'watch',
				media: [
					{ url: 'https://example.com/thumb.jpg', kind: 'image' },
					{ url: 'https://example.com/video.mp4', kind: 'video', durationSeconds: 754 }
				]
			})
		).toBe(754);
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

describe('FeedsState.loadAndCatchUp', () => {
	function person(overrides: Partial<Person> = {}): Person {
		return {
			id: 'person-lena',
			name: 'Lena',
			siteUrl: 'https://lena.example.com/',
			followedAt: '2026-09-20T10:00:00.000Z',
			...overrides
		};
	}

	function feed(overrides: Partial<Feed> = {}): Feed {
		return {
			id: 'https://lena.example.com/feed.xml',
			personId: 'person-lena',
			url: 'https://lena.example.com/feed.xml',
			kind: 'blog',
			title: 'Lena',
			verified: true,
			failures: 0,
			enabled: true,
			...overrides
		};
	}

	/*
	 * `store` is the app's one real singleton (see store/index.ts), already opened by whichever
	 * test in this file ran first: unlike a test that constructs its own `IdbStore`, swapping
	 * `globalThis.indexedDB` here would not give it a fresh database, since it never reopens once
	 * `this.database` is set. Isolation instead comes from cleaning up what each test itself
	 * followed, not from resetting the store.
	 */
	beforeEach(async () => {
		refreshCalls.length = 0;
		await store.init();
	});

	afterEach(async () => {
		await store.unfollow('person-lena');
	});

	it('asks refreshAll only for the feed that has never been fetched, not every followed one', async () => {
		await store.follow(person(), [
			feed({ lastFetchedAt: '2026-09-20T10:05:00.000Z' }),
			feed({
				id: 'https://lena.example.com/new.xml',
				url: 'https://lena.example.com/new.xml',
				title: 'Lena (new feed)'
			})
		]);

		await feeds.loadAndCatchUp();

		expect(refreshCalls).toEqual([{ feedIds: ['https://lena.example.com/new.xml'] }]);
	});

	it('never calls refreshAll when every followed feed has already been fetched at least once', async () => {
		await store.follow(person(), [feed({ lastFetchedAt: '2026-09-20T10:05:00.000Z' })]);

		await feeds.loadAndCatchUp();

		expect(refreshCalls).toEqual([]);
	});
});
