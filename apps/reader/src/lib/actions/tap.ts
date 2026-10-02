import { gesture } from '../motion.js';

/**
 * A button that answers the moment a finger lifts, wherever the button has got to by then.
 *
 * A browser only makes a `click` when the press and the release land on the same element. Two
 * things on Discover break that. A member's buttons slide in, so a tap on one that is still
 * moving is pressed on the button and released on whatever is under the finger a moment later,
 * and no click is made. And after a swipe, the browser sometimes makes no click at all for a tap
 * soon afterwards (the tab bar met the same thing; see TabBar.svelte). Either way the button looked
 * dead for a second or two after a new member arrived.
 *
 * So this listens for the press and the release themselves: a press on the button followed by a
 * release that has not travelled is a tap, whatever is under the finger by then. A real `click`
 * with no such tap behind it (the keyboard, a screen reader, a switch) still works.
 *
 * The click the browser makes after a handled tap is swallowed, wherever it lands. It has to be:
 * a tap that opens a menu puts the menu under the finger before that click arrives, and the click
 * then went to whatever menu item was there (More actions liked the creator).
 */
export function tap(node: HTMLElement, onTap: () => void) {
	let handler = onTap;
	let press: { id: number; x: number; y: number } | null = null;
	let handledAt = -Infinity;

	const disabled = () => (node as HTMLButtonElement).disabled === true;

	function onUp(event: PointerEvent): void {
		if (!press || event.pointerId !== press.id) return;
		const travelled = Math.hypot(event.clientX - press.x, event.clientY - press.y);
		release();
		// A release that has moved is a swipe or a change of mind, not a tap.
		if (event.type !== 'pointerup' || travelled > gesture.slopPx || disabled()) return;
		handledAt = performance.now();
		swallowNextClick();
		handler();
	}

	let swallowTimer: ReturnType<typeof setTimeout> | undefined;
	function swallow(event: Event): void {
		event.stopPropagation();
		event.preventDefault();
		stopSwallowing();
	}
	function stopSwallowing(): void {
		clearTimeout(swallowTimer);
		window.removeEventListener('click', swallow, true);
	}
	function swallowNextClick(): void {
		stopSwallowing();
		window.addEventListener('click', swallow, true);
		// No click came (the browser sometimes makes none): stop before it eats a real one.
		swallowTimer = setTimeout(stopSwallowing, 400);
	}

	function release(): void {
		press = null;
		window.removeEventListener('pointerup', onUp, true);
		window.removeEventListener('pointercancel', onUp, true);
	}

	function onDown(event: PointerEvent): void {
		if (!event.isPrimary || event.button !== 0 || disabled()) return;
		release();
		press = { id: event.pointerId, x: event.clientX, y: event.clientY };
		// On the window: by the time the finger lifts, the button may no longer be under it.
		window.addEventListener('pointerup', onUp, true);
		window.addEventListener('pointercancel', onUp, true);
	}

	function onClick(): void {
		// Only reached with no tap behind it: the click after a tap is swallowed before it gets here.
		if (performance.now() - handledAt < 400) return;
		handler();
	}

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('click', onClick);

	return {
		update(next: () => void) {
			handler = next;
		},
		destroy() {
			release();
			stopSwallowing();
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('click', onClick);
		}
	};
}
