/**
 * Reports each card that scrolls up past the top of its pane, once.
 *
 * It measures the cards' layout positions, not where they are drawn. The card stack tips a card
 * back and pins it at the top while it fades, so on screen it never actually leaves the pane, and
 * an observer of its drawn position never fires. Only a card that crosses the top edge during a
 * scroll counts, so one already above a restored scroll position is not marked as read.
 * It does not depend on the card stack's motion, so it keeps working for reduced motion.
 */
export interface ReadOnScrollOptions {
	enabled: () => boolean;
	onRead: (key: string) => void;
}

export function readOnScroll(pane: HTMLElement, options: ReadOnScrollOptions) {
	let current = options;
	let last = pane.scrollTop;
	let pending = false;

	function check() {
		pending = false;
		const top = pane.scrollTop;
		const from = last;
		last = top;
		if (top <= from || !current.enabled()) return;

		for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack[data-key]')) {
			const bottom = card.offsetTop + card.offsetHeight;
			if (bottom > from && bottom <= top) current.onRead(card.dataset.key!);
		}
	}

	function onScroll() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(check);
	}
	pane.addEventListener('scroll', onScroll, { passive: true });

	return {
		update(next: ReadOnScrollOptions) {
			current = next;
		},
		destroy() {
			pane.removeEventListener('scroll', onScroll);
		}
	};
}
