import type { PartnerAdapter } from '@yipden/ring-client';

/**
 * Which partner rings this build reads, and how it gets each one's document.
 *
 * **Empty on purpose.** A partner ring is added here only with an adapter written for that ring
 * and agreed first, because choosing which ring to read, and how, is a ring contract decision.
 * Until then the surface exists and shows nothing: Discover offers no ring switcher at all while
 * this list is empty.
 */

export interface PartnerSource {
	adapter: PartnerAdapter;
	/** Fetch the ring's own document. Whatever it returns is untrusted until `readPartnerRing`. */
	load(): Promise<unknown>;
}

/**
 * A one-time, devtools-free way to turn a local flag on: append `?<key>=1` to the URL this reader
 * was loaded from. `docs/android-testing.md`'s `CAP_LIVE_RELOAD_URL` is exactly such a URL, baked
 * into the installed app at `cap sync` time, so this is what lets a phone without a working
 * `chrome://inspect` path (no second machine, USB debugging not cooperating) still opt in to a
 * testing-only source: the flag is written to storage the first time the app loads from that URL,
 * and behaves exactly as if it had been set from a console from then on. The query string is
 * never needed again after that first load.
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
 * Musicians Webring (`yipden:partnerMusiciansWebring`) and Knifebeetle (`yipden:partnerKnifebeetle`)
 * are real rings, read live, for testing only, not yet approved by either maintainer. Neither
 * needs a build flag: nothing about them ships in the bundle either way, only a live fetch this
 * reader chooses to make. See DECISIONS.md and ROADMAP.md; **do not tag a v0.9.0 release with
 * either still able to turn on** until that changes.
 */
export async function partnerSources(): Promise<PartnerSource[]> {
	adoptUrlFlag('yipden:partnerFixture');
	adoptUrlFlag('yipden:partnerMusiciansWebring');
	adoptUrlFlag('yipden:partnerKnifebeetle');

	const sources: PartnerSource[] = [];

	if (import.meta.env.VITE_YIPDEN_PARTNER_FIXTURE === '1' && localFlag('yipden:partnerFixture')) {
		sources.push((await import('./fixture.js')).fixtureSource);
	}
	if (localFlag('yipden:partnerMusiciansWebring')) {
		sources.push((await import('./musiciansWebring.js')).musiciansWebringSource);
	}
	if (localFlag('yipden:partnerKnifebeetle')) {
		sources.push((await import('./knifebeetleWebring.js')).knifebeetleSource);
	}

	return sources;
}
