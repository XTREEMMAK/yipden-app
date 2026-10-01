import type { PartnerAdapter } from '@yipden/ring-client';
import type { PartnerFetch, PartnerValidators } from './fetchPage.js';

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
	/**
	 * A ring read live over the network implements this too, so its page can be kept on the phone
	 * and asked "has this changed?" (ETag / Last-Modified) instead of downloaded on every launch.
	 * A bundled source (the fixture) has nothing to revalidate and leaves it out.
	 */
	revalidate?(validators: PartnerValidators): Promise<PartnerFetch>;
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
 * The live, testing-only rings, switchable from Settings. The URL flag above only reaches the
 * origin it was loaded from, and storage is per origin: a live-reload session
 * (`http://<ip>:5173`) and the bundled APK (`https://localhost`) never see each other's flags, so
 * an installed build needs its own way to turn these on.
 */
export const TESTING_RINGS = [
	{ key: 'yipden:partnerMusiciansWebring', name: 'Musicians Webring' },
	{ key: 'yipden:partnerKnifebeetle', name: 'Knifebeetle' }
] as const;

export function testingRingOn(key: string): boolean {
	return localFlag(key);
}

export function setTestingRing(key: string, on: boolean): void {
	try {
		if (on) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
	} catch {
		// No storage: nothing to remember the choice in.
	}
}

/**
 * The fixture ring is compiled in only when a build sets `VITE_YIPDEN_PARTNER_FIXTURE=1`, which
 * the end to end suite does and a release build does not, and even then it stays off until a
 * test opts in. It needs no network: the fixture document is bundled with it.
 *
 * Musicians Webring (`yipden:partnerMusiciansWebring`) and Knifebeetle (`yipden:partnerKnifebeetle`)
 * are real rings, read live, for testing only, not yet approved by either maintainer, so they exist
 * only in a debug build (`__YIPDEN_DEBUG__`, see vite.config.ts). A release build never reads either flag and
 * never fetches either ring, whatever this phone has stored. See DECISIONS.md and ROADMAP.md.
 */
export async function partnerSources(): Promise<PartnerSource[]> {
	adoptUrlFlag('yipden:partnerFixture');
	if (__YIPDEN_DEBUG__) {
		adoptUrlFlag('yipden:partnerMusiciansWebring');
		adoptUrlFlag('yipden:partnerKnifebeetle');
	}

	const sources: PartnerSource[] = [];

	if (import.meta.env.VITE_YIPDEN_PARTNER_FIXTURE === '1' && localFlag('yipden:partnerFixture')) {
		sources.push((await import('./fixture.js')).fixtureSource);
	}
	if (__YIPDEN_DEBUG__ && localFlag('yipden:partnerMusiciansWebring')) {
		sources.push((await import('./musiciansWebring.js')).musiciansWebringSource);
	}
	if (__YIPDEN_DEBUG__ && localFlag('yipden:partnerKnifebeetle')) {
		sources.push((await import('./knifebeetleWebring.js')).knifebeetleSource);
	}

	return sources;
}
