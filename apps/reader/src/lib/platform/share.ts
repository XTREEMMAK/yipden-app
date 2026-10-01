import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { safeUrl } from '@yipden/ring-client';

/**
 * Handing a link to the rest of the phone: the system share sheet, from which Chrome's "Send to
 * your devices", Firefox's "Send to device", a note, a message or an email are all one tap away.
 * That is how a Shelf link reaches a desktop browser without YipDen running a server or shipping
 * a browser extension of its own (see DECISIONS.md).
 *
 * On the web build, the browser's own share sheet where it has one, and otherwise a copy to the
 * clipboard, so the button always does something useful.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export async function shareLink(title: string, url: string): Promise<ShareOutcome> {
	const target = safeUrl(url)?.toString();
	if (!target) return 'unavailable';

	try {
		if (Capacitor.isNativePlatform()) {
			await Share.share({ title, url: target, dialogTitle: 'Send to…' });
			return 'shared';
		}
		if (typeof navigator.share === 'function') {
			await navigator.share({ title, url: target });
			return 'shared';
		}
		await navigator.clipboard.writeText(target);
		return 'copied';
	} catch (cause) {
		// Dismissing the sheet rejects on both Android and the web; that is a choice, not a failure.
		const message = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
		return /cancel|abort/i.test(message) ? 'cancelled' : 'unavailable';
	}
}
