import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
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
