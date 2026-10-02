import { player } from '../player.svelte.js';

/**
 * Scrolling a list tucks the mini player down to a small button.
 *
 * The mini player sits just above the tab bar, right where a thumb lands while scrolling Feeds or
 * a ring's members: a scroll that began on it slid it up into the full player, or caught its
 * close button. Once the list has moved a little, it shrinks to a button in the corner, out of the
 * thumb's way, and a tap on that button brings it back. It is the same small button a reader gets
 * by dropping the mini player on Minimize, and like that one it stays until it is tapped.
 */

/** How far the list must move before the player steps aside: more than a resting thumb wobbles. */
const TUCK_AFTER_PX = 24;

export function tuckMini(pane: HTMLElement) {
	let from = pane.scrollTop;

	function onScroll(): void {
		if (player.miniTucked || player.sheet !== 'mini') {
			from = pane.scrollTop;
			return;
		}
		if (Math.abs(pane.scrollTop - from) >= TUCK_AFTER_PX) player.miniTucked = true;
	}
	pane.addEventListener('scroll', onScroll, { passive: true });

	return {
		destroy() {
			pane.removeEventListener('scroll', onScroll);
		}
	};
}
