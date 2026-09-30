import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type * as RefreshModule from './refresh.js';

/**
 * `refreshAllFollowed` only needs to know that it asked `refreshAll` for everything (no scoped
 * `feedIds`) and then reloaded; a real `refreshAll` would reach the network, which this file has
 * no business doing.
 */
const refreshCalls: Array<{ feedIds?: string[] }> = [];
vi.mock('./refresh.js', async (importOriginal) => ({
	...(await importOriginal<typeof RefreshModule>()),
	refreshAll: async (options: { feedIds?: string[] } = {}) => {
		refreshCalls.push(options);
		return { feeds: [], added: 0 };
	}
}));

import { player, type QueueItem } from './player.svelte.js';
import { ringPlayer, type RingQueueRecord } from './ringPlayer.svelte.js';
import { store, type Person } from './store/index.js';
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
