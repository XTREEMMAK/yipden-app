import { stableYipId } from '@yipden/feeds';
import type { StoredYip } from './types.js';

/**
 * Moving a yip stored under the old key, `${feedId}::${entryId}`, to its stable id.
 *
 * Used once by the move into the encrypted store and by every backup import, since a backup
 * file can come from before the move. A yip already on its stable id comes back unchanged.
 */

/** The feed a legacy record came from: its own field, else the prefix of its key. */
function feedIdOf(yip: StoredYip): string {
	if (yip.feedId) return yip.feedId;
	const separator = yip.key.indexOf('::');
	return separator > 0 ? yip.key.slice(0, separator) : yip.sourceFeedId;
}

/**
 * The entry's own identifier. Records from before `entryId` hold it after the feed in their key,
 * and in `id`, which was the entry id until stable ids replaced it.
 */
function entryIdOf(yip: StoredYip, feedId: string): string {
	if (yip.entryId) return yip.entryId;
	const prefix = `${feedId}::`;
	if (yip.key.startsWith(prefix)) return yip.key.slice(prefix.length);
	return yip.id || yip.url;
}

export function rekeyYip(yip: StoredYip): StoredYip {
	const feedId = feedIdOf(yip);
	const entryId = entryIdOf(yip, feedId);
	const id = stableYipId(yip.sourceFeedId, entryId);
	return { ...yip, key: id, id, feedId, entryId };
}

export interface Rekeyed {
	yips: StoredYip[];
	/** Old key to new, for anything else that saved a yip's key (the player's queue). */
	keys: Map<string, string>;
}

/**
 * Re-key a whole set. Two old records landing on one id (one entry reached through two feed
 * records that now redirect to the same address) become one, keeping the earliest `seenAt` and
 * the earliest `readAt`, so nothing read turns unread and nothing seen turns new.
 */
export function rekeyAll(yips: StoredYip[]): Rekeyed {
	const byKey = new Map<string, StoredYip>();
	const keys = new Map<string, string>();
	for (const old of yips) {
		const next = rekeyYip(old);
		keys.set(old.key, next.key);
		const existing = byKey.get(next.key);
		if (!existing) {
			byKey.set(next.key, next);
			continue;
		}
		const readAt = [existing.readAt, next.readAt].filter(Boolean).sort()[0];
		byKey.set(next.key, {
			...existing,
			seenAt: [existing.seenAt, next.seenAt].sort()[0]!,
			...(readAt ? { readAt } : {})
		});
	}
	return { yips: [...byKey.values()], keys };
}
