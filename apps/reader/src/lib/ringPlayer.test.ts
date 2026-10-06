import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { RingEntry } from '@yipden/ring-client';
import { player, type QueueItem } from './player.svelte.js';
import { prefs } from './prefs.svelte.js';
import { ringPlayer, type RingQueueRecord } from './ringPlayer.svelte.js';
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
	prefs.shuffleMusic = true;
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

	it('forgets an earlier session once a queue from elsewhere (the Library) has replaced it', () => {
		const talk = member({ id: 'talk', form: 'spoken' });
		// An old session of spoken word, then the Library: its queue holds none of those members.
		ringPlayer.play(talk);
		player.play([queueItem({ id: 'reader:x', batchKey: 'reader:lena' })], 0, undefined, {
			loop: false
		});
		expect(ringPlayer.suggest([...ring, talk])?.form).toBe('music');
		ringPlayer.add(ada);
		expect(ringPlayer.playedEntryIds).toEqual(['ada']);
		expect(ringPlayer.suggest([...ring, talk])?.id).toBe('bo');
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

	it('rejects a legacy saved queue whose ownership cannot be proven', () => {
		const legacy = {
			queue: [queueItem({ batchKey: 'ada' })],
			currentIndex: 0,
			playedEntryIds: ['ada']
		} as unknown as RingQueueRecord;

		ringPlayer.restore(legacy);
		expect(player.current).toBeNull();
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

describe('restoring a saved queue', () => {
	it('drops a track whose address is not safe, and a picture that is not', async () => {
		const { restorableItem } = await import('./ringPlayer.svelte.js');
		const base = {
			id: 'a',
			title: 'A',
			creator: 'Ash',
			url: 'https://ash.example/',
			siteUrl: 'https://ash.example/',
			mediaUrl: 'https://ash.example/a.mp3',
			artUrl: 'https://ash.example/a.jpg'
		};
		expect(restorableItem(base)?.artUrl).toBe('https://ash.example/a.jpg');
		expect(restorableItem({ ...base, artUrl: 'http://192.168.1.1/x.png' })?.artUrl).toBeNull();
		expect(restorableItem({ ...base, mediaUrl: 'https://192.168.1.1/a.mp3' })).toBeNull();
		expect(restorableItem({ ...base, mediaUrl: 'javascript:alert(1)' })).toBeNull();
		expect(restorableItem({ ...base, title: 42 })).toBeNull();
		expect(restorableItem(null)).toBeNull();
	});
});

describe('music shuffle', () => {
	it('deals a music member tracks in a shuffled order by default', () => {
		const many = member({
			id: 'many',
			tracks: Array.from({ length: 12 }, (_, i) => ({
				label: `T${i}`,
				media_url: `https://e.com/${i}.mp3`
			}))
		});
		const published = many.tracks!.map((track) => track.media_url);
		ringPlayer.play(many);
		const queued = player.queue.map((item) => item.mediaUrl);
		expect([...queued].sort()).toEqual([...published].sort());
		// 12 tracks staying in published order by chance is about one in 479 million.
		expect(queued).not.toEqual(published);
	});

	it('keeps the published order when the reader turns shuffle off', () => {
		prefs.shuffleMusic = false;
		ringPlayer.play(bo);
		expect(player.queue.map((item) => item.title)).toEqual(['One', 'Two']);
	});

	it('never shuffles spoken word', () => {
		const talk = member({
			id: 'talk',
			form: 'spoken',
			tracks: Array.from({ length: 12 }, (_, i) => ({
				label: `E${i}`,
				media_url: `https://e.com/t${i}.mp3`
			}))
		});
		ringPlayer.play(talk);
		expect(player.queue.map((item) => item.title)).toEqual(
			talk.tracks!.map((track) => track.label)
		);
	});
});
