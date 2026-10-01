import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { DiscoveredFeed } from '@yipden/feeds';
import type * as RefreshModule from './refresh.js';

/**
 * `refreshAllFollowed` only needs to know that it asked `refreshAll` for everything (no scoped
 * `feedIds`) and then reloaded; a real `refreshAll` would reach the network, which this file has
 * no business doing.
 */
const refreshCalls: Array<{ feedIds?: string[] }> = [];
/** What the next scoped check reports for each feed it was asked about. Unset means no result. */
let checkStatus: RefreshModule.FeedRefreshResult['status'] | undefined;
vi.mock('./refresh.js', async (importOriginal) => ({
	...(await importOriginal<typeof RefreshModule>()),
	refreshAll: async (options: { feedIds?: string[] } = {}) => {
		refreshCalls.push(options);
		const status = checkStatus;
		return {
			feeds: status
				? (options.feedIds ?? []).map((feedId) => ({
						feedId,
						status,
						added: 0,
						...(status === 'failed' ? { problem: { kind: 'gone' as const, status: 404 } } : {})
					}))
				: [],
			added: 0
		};
	}
}));

import { player, type QueueItem } from './player.svelte.js';
import { ringPlayer, type RingQueueRecord } from './ringPlayer.svelte.js';
import { store, type Feed, type Person } from './store/index.js';
import { you } from './you.svelte.js';

const person: Person = {
	id: 'person-ada',
	name: 'Ada',
	siteUrl: 'https://ada.example.com/',
	followedAt: '2026-09-25T00:00:00.000Z'
};

const track: QueueItem = {
	id: 'track',
	title: 'Track',
	creator: 'Ada',
	personId: person.id,
	url: 'https://ada.example.com/track',
	siteUrl: person.siteUrl,
	artUrl: null,
	mediaUrl: 'https://ada.example.com/track.mp3'
};

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
	player.clear();
	ringPlayer.playedEntryIds = [];
	you.rows = [];
	refreshCalls.length = 0;
	checkStatus = undefined;
});

describe('you.unfollow', () => {
	it('durably clears loaded and saved media before unfollow completes', async () => {
		await store.follow(person, []);
		you.rows = [{ person, feeds: [] }];
		player.play([track], 0);
		const legacyTrack = { ...track };
		delete legacyTrack.personId;
		const stale: RingQueueRecord = {
			version: 2,
			queue: [{ ...legacyTrack, batchKey: 'old-ring-member' }],
			currentIndex: 0,
			playedEntryIds: ['old-ring-member']
		};
		await store.setSetting('ringQueue', stale);

		await you.unfollow(person.id);

		expect(player.current).toBeNull();
		expect(await store.getSetting('ringQueue')).toBeNull();
	});
});

describe('you.refreshAllFollowed', () => {
	it('checks every followed feed, unscoped, then reloads the follow rows', async () => {
		await store.follow(person, []);

		await you.refreshAllFollowed();

		expect(refreshCalls).toEqual([{}]);
		expect(you.rows.map((row) => row.person.id)).toEqual([person.id]);

		await you.unfollow(person.id);
	});
});

describe('you.replaceSource', () => {
	const dead: Feed = {
		id: 'https://ada.example.com/old.xml',
		personId: person.id,
		url: 'https://ada.example.com/old.xml',
		kind: 'blog',
		title: 'Ada',
		verified: true,
		provenance: 'discovered',
		failures: 5,
		lastError: { kind: 'gone', status: 404 },
		enabled: true
	};
	const moved: DiscoveredFeed = {
		url: 'https://ada.example.com/new.xml',
		kind: 'blog',
		title: 'Ada',
		via: 'direct',
		verified: false
	};

	beforeEach(async () => {
		// The store keeps its connection across tests; start this creator from nothing.
		await store.unfollow(person.id);
		await store.follow(person, [dead]);
		await you.load();
	});

	it('swaps in the new address once it checks out, as a manual source', async () => {
		checkStatus = 'updated';
		expect(await you.replaceSource(person.id, dead.id, moved)).toEqual({ status: 'replaced' });

		const feeds = await store.listFeeds();
		expect(feeds.map((feed) => feed.url)).toEqual([moved.url]);
		expect(feeds[0]).toMatchObject({ provenance: 'manual', verified: false, failures: 0 });
		expect(refreshCalls).toEqual([{ feedIds: [moved.url] }]);
	});

	it('keeps the old address, and drops the new one, when the new one fails too', async () => {
		checkStatus = 'failed';
		expect(await you.replaceSource(person.id, dead.id, moved)).toEqual({
			status: 'failed',
			problem: { kind: 'gone', status: 404 }
		});
		expect((await store.listFeeds()).map((feed) => feed.url)).toEqual([dead.url]);
	});

	it('refuses the address that is already failing', async () => {
		expect(await you.replaceSource(person.id, dead.id, { ...moved, url: dead.url })).toEqual({
			status: 'same-address'
		});
		expect(refreshCalls).toEqual([]);
	});
});
