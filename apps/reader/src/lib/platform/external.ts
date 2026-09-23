/**
 * Opening a creator's page.
 *
 * Always in the system browser, never inside the app's own WebView. A creator's site running
 * inside the app's origin would share it, which is the difference between linking to someone
 * and hosting them. This product is a reader, not a destination.
 */

import { safeUrl } from '@yipden/ring-client';

export function openExternal(url: string): void {
	const target = safeUrl(url);
	if (!target) return;

	// noopener and noreferrer: the page opened gets no handle on this one, and the creator's
	// server is not told which yip the reader came from.
	window.open(target.toString(), '_blank', 'noopener,noreferrer');
}
