import { suggestNextEntry, type RingEntry } from '@yipden/ring-client';
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
		player.addToQueue(this.itemsFor(entry));
		if (!this.playedEntryIds.includes(entry.id)) {
			this.playedEntryIds = [...this.playedEntryIds, entry.id];
		}
	}

	/** Drops one member's tracks from the queue entirely, wherever they currently sit. */
	remove(entryId: string): void {
		player.removeBatch(entryId);
		this.playedEntryIds = this.playedEntryIds.filter((id) => id !== entryId);
	}

	/** Who to suggest next, given everyone already in this session, or `null` if no one is left. */
	suggest(ring: RingEntry[]): RingEntry | null {
		const played = this.playedEntryIds
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
		if (record.version !== 2) return;
		player.hydrate(record.queue, record.currentIndex, { loop: false });
		this.playedEntryIds = record.playedEntryIds;
	}
}

export const ringPlayer = new RingPlayerState();
