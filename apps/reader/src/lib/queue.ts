import type { RingEntry } from '@yipden/ring-client';
import { heroImage } from '@yipden/ring-client';
import type { QueueItem } from './player.svelte.js';
import type { StoredYip } from './store/index.js';

/**
 * Turning what Listen shows into what the player can actually play.
 *
 * The queue is exactly Listen's own list: every followed yip with an audio enclosure, then
 * every ring track, in the order Listen already shows them. A reader pressing play on a card
 * gets a queue that matches what they were looking at, not a separate ordering invented here.
 */

export function queueItemFromYip(yip: StoredYip): QueueItem | null {
	const media = yip.media.find((entry) => entry.kind === 'audio');
	if (!media) return null;
	return {
		id: yip.key,
		title: yip.title,
		creator: yip.author ?? '',
		url: yip.url,
		siteUrl: yip.url,
		artUrl: yip.media.find((entry) => entry.kind === 'image')?.url ?? null,
		mediaUrl: media.url
	};
}

export function queueItemsFromRing(entries: RingEntry[]): QueueItem[] {
	const items: QueueItem[] = [];
	for (const entry of entries) {
		for (const track of entry.tracks ?? []) {
			items.push({
				id: track.media_url,
				title: track.label,
				creator: entry.creator,
				url: entry.source_url,
				siteUrl: entry.source_url,
				artUrl: heroImage(entry),
				mediaUrl: track.media_url,
				// Which member these tracks are from, so a continuous-play session can tell
				// whose tracks just finished and remove or reorder a whole member at once.
				batchKey: entry.id
			});
		}
	}
	return items;
}

export function buildListenQueue(yips: StoredYip[], ringEntries: RingEntry[]): QueueItem[] {
	const fromYips = yips.map(queueItemFromYip).filter((item): item is QueueItem => item !== null);
	return [...fromYips, ...queueItemsFromRing(ringEntries)];
}

/** Fisher-Yates, returning a new array. `random` is injectable so tests are deterministic. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}
