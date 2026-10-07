import { creatorNotes } from './creatorNotes.svelte.js';
import { explored } from './explored.svelte.js';
import { siteBrowser } from './platform/siteBrowser.svelte.js';
import { prefs } from './prefs.svelte.js';
import { toggleShelf } from './shelf.svelte.js';
import type { SiteEntry } from './sites/types.js';

/**
 * What a reader does with a site in Surf, from its card or its full preview alike, so the two
 * can never drift apart. A site is a place: it is visited and saved, never followed as a person.
 */

/** Only an https picture is kept with a Like or a Save: a bundled one is not an address. */
export function remoteThumb(entry: SiteEntry): string | null {
	return entry.poster_url?.startsWith('https://') ? entry.poster_url : null;
}

export function siteLayout(entry: SiteEntry) {
	return creatorNotes.layoutFor(entry.url, entry.layout);
}

/** Visiting counts as having looked at it. The in-app browser, when the reader allows it. */
export function visitSite(entry: SiteEntry): void {
	void explored.mark(entry.url);
	void siteBrowser.open(
		entry.url,
		{
			url: entry.url,
			name: entry.title,
			artUrl: remoteThumb(entry),
			layout: siteLayout(entry),
			ring: null
		},
		prefs.sitesInApp
	);
}

export function saveSite(entry: SiteEntry): void {
	const thumb = remoteThumb(entry);
	void toggleShelf({
		url: entry.url,
		title: entry.title,
		via: typeof entry.software === 'string' ? 'Forums' : 'Surf',
		from: 'discover',
		...(thumb ? { thumbUrl: thumb } : {})
	});
}
