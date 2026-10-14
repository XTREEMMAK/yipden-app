import { hashIdentity } from './identity.js';
import type { Listing, Person } from './types.js';

/** Who wins when one person is listed twice: the one who opted in, then the one who confirmed. */
const RANK: Record<Listing, number> = { member: 0, confirmed: 1, curated: 2, list: 3 };

/** The hashes of a person's identities, for checking against `optouts.json`. */
export async function hashesOf(person: Person): Promise<string[]> {
	return Promise.all(person.identities.map(hashIdentity));
}

/** Whether any form of this person is on the opt-out list. */
export async function isOptedOut(person: Person, optOuts: ReadonlySet<string>): Promise<boolean> {
	if (!optOuts.size) return false;
	for (const hash of await hashesOf(person)) if (optOuts.has(hash)) return true;
	return false;
}

/**
 * Everyone Discover may show, from every enabled source, in the order the sources were given.
 *
 * - Anyone hidden by their own source (`discoverable: false`) is left out.
 * - Anyone on YipDen's opt-out list is left out, whichever source names them, a list a reader
 *   added included (DECISIONS.md, 2026-10-14).
 * - The same person found twice (any shared identity: their site, a feed, an account) is one
 *   person, and the opted-in listing wins: a ring member over a confirmed listing over a curated
 *   one over a reader's list. Ties go to the earlier source.
 */
export async function mergePeople(
	sources: Person[][],
	optOuts: ReadonlySet<string> = new Set()
): Promise<Person[]> {
	const candidates: { person: Person; order: number }[] = [];
	let order = 0;
	for (const people of sources) {
		for (const person of people) {
			const at = order++;
			if (!person.discoverable) continue;
			if (await isOptedOut(person, optOuts)) continue;
			candidates.push({ person, order: at });
		}
	}

	candidates.sort((a, b) => RANK[a.person.listing] - RANK[b.person.listing] || a.order - b.order);
	const claimed = new Set<string>();
	const kept: { person: Person; order: number }[] = [];
	for (const candidate of candidates) {
		if (candidate.person.identities.some((identity) => claimed.has(identity))) continue;
		for (const identity of candidate.person.identities) claimed.add(identity);
		kept.push(candidate);
	}
	return kept.sort((a, b) => a.order - b.order).map((entry) => entry.person);
}
