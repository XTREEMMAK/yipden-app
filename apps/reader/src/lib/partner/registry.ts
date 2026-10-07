import type { PartnerAdapter } from '@yipden/ring-client';
import type { PartnerFetch, PartnerValidators } from './fetchPage.js';

/**
 * Which partner rings this build reads, and how it gets each one's document.
 *
 * A partner ring is added here only with an adapter written for that ring, because choosing which
 * ring to read, and how, is a ring contract decision. Discover offers no ring switcher at all
 * while this list is empty.
 */

export interface PartnerSource {
	adapter: PartnerAdapter;
	/** Fetch the ring's own document. Whatever it returns is untrusted until `readPartnerRing`. */
	load(): Promise<unknown>;
	/**
	 * A ring read live over the network implements this too, so its page can be kept on the phone
	 * and asked "has this changed?" (ETag / Last-Modified) instead of downloaded on every launch.
	 * A bundled source (the fixture) has nothing to revalidate and leaves it out.
	 */
	revalidate?(validators: PartnerValidators): Promise<PartnerFetch>;
}

/**
 * A one-time, devtools-free way to turn a local flag on: append `?<key>=1` to the URL this reader
 * was loaded from. The flag is written to storage on that first load and behaves exactly as if it
 * had been set from a console from then on.
 */
function adoptUrlFlag(key: string): void {
	try {
		if (new URLSearchParams(location.search).get(key) === '1') localStorage.setItem(key, '1');
	} catch {
		// No location or storage to read from, in a test most likely. Nothing to adopt.
	}
}

function localFlag(key: string): boolean {
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

/**
 * The fixture ring is compiled in only when a build sets `VITE_YIPDEN_PARTNER_FIXTURE=1`, which
 * the end to end suite does and a release build does not, and even then it stays off until a
 * test opts in. It needs no network: the fixture document is bundled with it.
 *
 * Musicians Webring, Knifebeetle and the five added on 2026-10-07 are real rings, read live, and on for everyone: each links
 * back to its ring's own site and carries that ring's own badge. See DECISIONS.md. The one build
 * that leaves them out is the end to end suite's (`VITE_YIPDEN_PARTNER_LIVE=0`), which must not
 * touch the network.
 */
export async function partnerSources(): Promise<PartnerSource[]> {
	adoptUrlFlag('yipden:partnerFixture');

	const sources: PartnerSource[] = [];

	if (import.meta.env.VITE_YIPDEN_PARTNER_FIXTURE === '1' && localFlag('yipden:partnerFixture')) {
		sources.push((await import('./fixture.js')).fixtureSource);
	}
	if (import.meta.env.VITE_YIPDEN_PARTNER_LIVE !== '0') {
		sources.push((await import('./musiciansWebring.js')).musiciansWebringSource);
		sources.push((await import('./knifebeetleWebring.js')).knifebeetleSource);
		// Added 2026-10-07 at the maintainer's request: each read through its own adapter.
		sources.push((await import('./webringTheMusic.js')).webringTheMusicSource);
		sources.push((await import('./smallwayComics.js')).smallwayComicsSource);
		sources.push((await import('./inkShrines.js')).inkShrinesSource);
		sources.push((await import('./webcomicQuest.js')).webcomicQuestSource);
		sources.push((await import('./homebrewWebring.js')).homebrewSource);
	}

	return sources;
}
