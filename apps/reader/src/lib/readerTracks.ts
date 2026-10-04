/**
 * A track a reader added to a creator themselves. The shape alone, so the backup can check one
 * without loading the player; `creatorNotes.svelte.ts` owns the list.
 */
export interface ReaderTrack {
	url: string;
	title: string;
	addedAt: string;
	/** The page it was found on, when it came from browsing their site. */
	foundOn?: string;
}

export const MAX_TRACKS_PER_CREATOR = 20;

/** A title from the address itself when nobody gave one: the file's own name, tidied. */
export function titleFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const file = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
		const name = file
			.replace(/\.[a-z0-9]{2,5}$/i, '')
			.replace(/[-_]+/g, ' ')
			.trim();
		return name || parsed.hostname.replace(/^www\./, '');
	} catch {
		return 'Track';
	}
}
