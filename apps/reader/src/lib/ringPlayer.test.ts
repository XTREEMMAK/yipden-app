import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { RingEntry } from '@yipden/ring-client';
import { player, type QueueItem } from './player.svelte.js';
import { ringPlayer } from './ringPlayer.svelte.js';
import { store } from './store/index.js';

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
	return {
		id: 'z',
		title: 'Some track',
		creator: 'Someone',
		url: 'https://example.com/someone',
		siteUrl: 'https://example.com/someone',
		artUrl: null,
		mediaUrl: 'https://example.com/someone.mp3',
		...overrides
	};
}

function member(overrides: Partial<RingEntry> & Pick<RingEntry, 'id'>): RingEntry {
	return {
		creator: overrides.id,
		type: 'audio',
		source_url: `https://${overrides.id}.example.com/`,
		form: 'music',
		tags: [],
		tracks: [
			{ label: 'One', media_url: `https://example.com/${overrides.id}-1.mp3` },
			{ label: 'Two', media_url: `https://example.com/${overrides.id}-2.mp3` }
		],
		...overrides
	};
}

const ada = member({ id: 'ada', tags: ['synth'] });
const bo = member({ id: 'bo', tags: ['synth', 'lofi'] });
const cass = member({ id: 'cass', tags: ['folk'] });
const ring = [ada, bo, cass];

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
	player.queue = [];
	player.currentIndex = -1;
	player.playing = false;
	player.sheet = 'hidden';
	player.loop = true;
	player.ended = false;
	ringPlayer.playedEntryIds = [];
});

describe('play', () => {
	it('replaces the queue with just this member, tagged with their id', () => {
		ringPlayer.play(ada);
		expect(player.queue.map((item) => item.batchKey)).toEqual(['ada', 'ada']);
		expect(player.loop).toBe(false);
		expect(ringPlayer.playedEntryIds).toEqual(['ada']);
	});

	it('starting a new member replaces the session rather than extending it', () => {
		ringPlayer.play(ada);
		ringPlayer.play(bo);
		expect(ringPlayer.playedEntryIds).toEqual(['bo']);
		expect(player.queue.every((item) => item.batchKey === 'bo')).toBe(true);
	});
});

describe('add', () => {
	it('appends a member without touching who is currently playing', () => {
		ringPlayer.play(ada);
		ringPlayer.add(bo);
		expect(player.current?.batchKey).toBe('ada');
		expect(player.queue.map((item) => item.batchKey)).toEqual(['ada', 'ada', 'bo', 'bo']);
		expect(ringPlayer.playedEntryIds).toEqual(['ada', 'bo']);
	});

	it('does not add the same member to the session twice', () => {
		ringPlayer.play(ada);
		ringPlayer.add(ada);
		expect(ringPlayer.playedEntryIds).toEqual(['ada']);
	});
});

describe('remove', () => {
	it('drops every one of a member track and adjusts the playhead', () => {
		ringPlayer.play(ada);
		ringPlayer.add(bo);
		ringPlayer.remove('ada');
		expect(player.queue.every((item) => item.batchKey === 'bo')).toBe(true);
		expect(player.current?.batchKey).toBe('bo');
		expect(ringPlayer.playedEntryIds).toEqual(['bo']);
	});
});

describe('suggest', () => {
	it('suggests a member not yet in the session', () => {
		ringPlayer.play(ada);
		expect(ringPlayer.suggest(ring)?.id).toBe('bo');
	});

	it('returns null once everyone playable has been played', () => {
		ringPlayer.play(ada);
		ringPlayer.add(bo);
		ringPlayer.add(cass);
		expect(ringPlayer.suggest(ring)).toBeNull();
	});
});

describe('snapshot and restore', () => {
	it('has nothing to snapshot outside a ring session', () => {
		expect(ringPlayer.snapshot()).toBeNull();
		player.play([queueItem()], 0);
		expect(ringPlayer.snapshot()).toBeNull();
	});

	it('produces a snapshot IndexedDB can actually store', async () => {
		ringPlayer.play(ada);
		ringPlayer.add(bo);
		const snapshot = ringPlayer.snapshot();
		// A live `$state` proxy cannot be structured cloned, which is what IndexedDB does on put.
		expect(() => structuredClone(snapshot)).not.toThrow();

		await store.setSetting('ringQueue', snapshot);
		const stored = await store.getSetting<typeof snapshot>('ringQueue');
		expect(stored?.playedEntryIds).toEqual(['ada', 'bo']);
	});

	it('round trips a session through snapshot and restore', () => {
		ringPlayer.play(ada);
		ringPlayer.add(bo);
		const snapshot = ringPlayer.snapshot();
		expect(snapshot).not.toBeNull();

		player.queue = [];
		player.currentIndex = -1;
		player.sheet = 'hidden';
		ringPlayer.playedEntryIds = [];

		ringPlayer.restore(snapshot!);
		expect(player.current?.batchKey).toBe('ada');
		expect(player.sheet).toBe('mini');
		expect(player.playing).toBe(false);
		expect(ringPlayer.playedEntryIds).toEqual(['ada', 'bo']);
	});
});
