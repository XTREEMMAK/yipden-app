import type { RingEntry } from './types.js';
import { entriesOf, type Ring } from './rotation.js';

/**
 * Who to suggest next, for a client that plays a ring member's tracks through and wants to keep
 * a listening session going rather than stopping cold. Not part of the ring's own rotation (that
 * answers "who is today's member," a question every client agrees on); this answers "who is a
 * good next stop for this one reader, right now," which is personal and never needs to agree
 * with anyone else's answer.
 */

export interface SuggestOptions {
	/** Injectable for deterministic tests; defaults to `Math.random`. */
	random?: () => number;
}

/**
 * Scores every audio member not yet played by how many tags they share with everything already
 * played this session, and returns one of the top scorers, picked at random among ties.
 *
 * `played` is the members already heard, in the order they were heard, not just their ids: the
 * first one anchors `form`, so a session that started on music stays on music rather than
 * suggesting spoken word next, the same rule a member's own `tracks[]` never mixes.
 */
export function suggestNextEntry(
	ring: Ring,
	played: RingEntry[],
	options: SuggestOptions = {}
): RingEntry | null {
	const playedIds = new Set(played.map((entry) => entry.id));
	const form = played[0]?.form;

	const candidates = entriesOf(ring).filter(
		(entry) =>
			!playedIds.has(entry.id) &&
			entry.type === 'audio' &&
			(entry.tracks?.length ?? 0) > 0 &&
			(!form || entry.form === form)
	);
	if (!candidates.length) return null;

	const playedTags = new Set(played.flatMap((entry) => entry.tags ?? []));

	let best: RingEntry[] = [];
	let bestScore = -1;
	for (const candidate of candidates) {
		const score = (candidate.tags ?? []).filter((tag) => playedTags.has(tag)).length;
		if (score > bestScore) {
			bestScore = score;
			best = [candidate];
		} else if (score === bestScore) {
			best.push(candidate);
		}
	}

	const random = options.random ?? Math.random;
	return best[Math.floor(random() * best.length)] ?? null;
}
