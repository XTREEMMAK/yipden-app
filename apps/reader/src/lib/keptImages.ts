/**
 * Pictures a reader has already looked at, kept ready for the rest of the session.
 *
 * A preview's pictures live on a creator's own host, and many of those hosts tell a browser not
 * to reuse what it downloaded (or say nothing useful at all), so closing a preview and opening it
 * again downloaded every picture a second time. A browser does reuse a picture that something on
 * the page is still holding, whatever the host said, so this holds the ones that have loaded: the
 * next `<img>` for the same address is drawn from memory, with no request.
 *
 * Bounded, oldest out first. What is held is the file as downloaded, not the decoded picture, so
 * a few dozen cost a few megabytes.
 */

const KEEP = 40;
const kept = new Map<string, HTMLImageElement>();

/** Call once a picture has loaded. Uses the same referrer policy as the `<img>` that showed it. */
export function keepImage(url: string): void {
	if (typeof Image === 'undefined') return;
	const held = kept.get(url);
	if (held) {
		// Looked at again: it becomes the newest.
		kept.delete(url);
		kept.set(url, held);
		return;
	}
	const image = new Image();
	image.referrerPolicy = 'no-referrer';
	image.src = url;
	kept.set(url, image);
	for (const oldest of kept.keys()) {
		if (kept.size <= KEEP) break;
		kept.delete(oldest);
	}
}
