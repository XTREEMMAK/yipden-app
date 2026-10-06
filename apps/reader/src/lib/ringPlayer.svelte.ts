import { safeUrl, suggestNextEntry, type RingEntry } from '@yipden/ring-client';
import { player, type QueueItem } from './player.svelte.js';
import { prefs } from './prefs.svelte.js';
import { queueItemsFromRing, shuffled } from './queue.js';

/**
 * Continuous play of the ring, on top of the one shared player everything else already uses.
 *
 * YipDen is, in effect, another client of the ring the same way IndieNodes' own app is: a
 * member's cover and a play button stand in for a flat track list, and playing one member
 * through can suggest another rather than stopping cold or looping the same member forever.
 * This file is the thin layer that makes that true, owned separately from `player.svelte.ts`
 * itself, which stays generic and has no idea any of its queues came from a ring at all.
 *
 * `playedEntryIds` is the one thing this file must track that the player's own queue cannot
 * reconstruct on its own: which members joined this session, and in what order they were
 * actually played, distinct from whatever order they end up sitting in after a reorder. The
 * suggestion algorithm needs that order (the first member anchors the session's `form`), and a
 * reorder in the queue panel must not be allowed to quietly change what "next" means.
 */

export interface RingQueueRecord {
	version: 2;
	queue: QueueItem[];
	currentIndex: number;
	playedEntryIds: string[];
}

const shortText = (value: unknown, max = 1_000): value is string =>
	typeof value === 'string' && value.length <= max;
const safeAddress = (value: unknown): value is string =>
	typeof value === 'string' && value.length <= 8_192 && safeUrl(value) !== null;

/**
 * A saved queue item, checked before it reaches the audio element or an image: storage can be
 * written by a restored backup file, which is input from outside like any other. Same address
 * rule as everywhere (`safeUrl`); a picture that fails it is dropped, a track that fails it is.
 */
export function restorableItem(value: unknown): QueueItem | null {
	if (!value || typeof value !== 'object') return null;
	const item = value as Record<string, unknown>;
	if (
		!shortText(item.id, 8_192) ||
		!shortText(item.title) ||
		!shortText(item.creator) ||
		!safeAddress(item.url) ||
		!safeAddress(item.siteUrl) ||
		!safeAddress(item.mediaUrl) ||
		(item.personId !== undefined && !shortText(item.personId, 8_192)) ||
		(item.batchKey !== undefined && !shortText(item.batchKey, 8_192))
	) {
		return null;
	}
	return {
		id: item.id,
		title: item.title,
		creator: item.creator,
		url: item.url,
		siteUrl: item.siteUrl,
		mediaUrl: item.mediaUrl,
		artUrl: safeAddress(item.artUrl) ? item.artUrl : null,
		...(item.personId !== undefined ? { personId: item.personId as string } : {}),
		...(item.batchKey !== undefined ? { batchKey: item.batchKey as string } : {})
	};
}

class RingPlayerState {
	playedEntryIds = $state<string[]>([]);

	/**
	 * A member's tracks as queue items, shuffled when the reader has music shuffle on (the
	 * default) and the member is music. Spoken word keeps its order: an episode two is not a
	 * fresh track to be dealt in at random.
	 */
	private itemsFor(entry: RingEntry): QueueItem[] {
		const items = queueItemsFromRing([entry]);
		return prefs.shuffleMusic && entry.form === 'music' ? shuffled(items) : items;
	}

	/** A member's Play button: replaces the queue with their tracks alone and starts playing. */
	play(entry: RingEntry, fromEl?: HTMLElement): void {
		player.play(this.itemsFor(entry), 0, fromEl, { loop: false });
		this.playedEntryIds = [entry.id];
	}

	/** Appends one member's tracks without disturbing playback: +Queue, or accepting a suggestion. */
	add(entry: RingEntry): void {
		// A queue started elsewhere (the Library) is a new session for the ring, not the last one's.
		const session = this.inQueue();
		player.addToQueue(this.itemsFor(entry));
		this.playedEntryIds = session.includes(entry.id) ? session : [...session, entry.id];
	}

	/**
	 * The members this session played, in order: only those still in the queue. A list left over
	 * from an earlier session would anchor suggestions to the wrong kind of member, or have none
	 * left at all, which stopped a Library queue after one ring member (phone feedback).
	 */
	private inQueue(): string[] {
		const queued = new Set(player.queue.map((item) => item.batchKey));
		return this.playedEntryIds.filter((id) => queued.has(id));
	}

	/** Drops one member's tracks from the queue entirely, wherever they currently sit. */
	remove(entryId: string): void {
		player.removeBatch(entryId);
		this.playedEntryIds = this.playedEntryIds.filter((id) => id !== entryId);
	}

	/** Who to suggest next, given everyone already in this session, or `null` if no one is left. */
	suggest(ring: RingEntry[]): RingEntry | null {
		const played = this.inQueue()
			.map((id) => ring.find((entry) => entry.id === id))
			.filter((entry): entry is RingEntry => entry !== undefined);
		return suggestNextEntry(ring, played);
	}

	/**
	 * A snapshot to persist: `null` outside a ring session, since there is nothing worth saving.
	 * Plain data, not the live `$state` proxies: IndexedDB structured clones what it stores, and
	 * a proxy cannot be cloned, which fails silently in a fire-and-forget save.
	 */
	snapshot(): RingQueueRecord | null {
		if (player.loop || !player.queue.length) return null;
		return {
			version: 2,
			queue: $state.snapshot(player.queue),
			currentIndex: player.currentIndex,
			playedEntryIds: $state.snapshot(this.playedEntryIds)
		};
	}

	/** Restores a session saved from a previous launch, paused until the reader presses play. */
	restore(record: RingQueueRecord): void {
		if (record?.version !== 2 || !Array.isArray(record.queue)) return;
		const current = record.queue[record.currentIndex];
		const queue = record.queue
			.slice(0, 1_000)
			.map(restorableItem)
			.filter((item): item is QueueItem => item !== null);
		const currentIndex = queue.findIndex((item) => item.id === restorableItem(current)?.id);
		if (!queue.length || currentIndex === -1) return;
		player.hydrate(queue, currentIndex, { loop: false });
		this.playedEntryIds = Array.isArray(record.playedEntryIds)
			? record.playedEntryIds.filter((id) => shortText(id, 1_000)).slice(0, 1_000)
			: [];
	}
}

export const ringPlayer = new RingPlayerState();
