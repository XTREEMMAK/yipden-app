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

/** How long the reader must be still on the last card before it counts as read. */
export const IDLE_READ_MS = 4000;

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
		// Switched off (the default), a scroll asks for nothing: a frame requested on every scroll
		// event keeps the main thread producing frames the whole time the list is moving.
		if (!current.enabled()) {
			last = pane.scrollTop;
			return;
		}
		pending = true;
		requestAnimationFrame(check);
	}
	pane.addEventListener('scroll', onScroll, { passive: true });

	/*
	 * The last card has nothing below it to scroll past, so the crossing above can never mark it.
	 * When the reader has been still for a few seconds with it fully on screen, that counts as
	 * having read it. Checked on a slow timer rather than per frame: it costs nothing while the
	 * pane is scrolling, and a pane that is not showing is skipped by `enabled`.
	 */
	let lastScrollAt = Date.now();
	pane.addEventListener('scroll', () => (lastScrollAt = Date.now()), { passive: true });
	const idle = setInterval(() => {
		if (Date.now() - lastScrollAt < IDLE_READ_MS || document.hidden || !current.enabled()) return;
		const cards = pane.querySelectorAll<HTMLElement>('.yip-stack[data-key]');
		const card = cards[cards.length - 1];
		if (!card) return;
		const box = card.getBoundingClientRect();
		const view = pane.getBoundingClientRect();
		if (box.top >= view.top - 1 && box.bottom <= view.bottom) current.onRead(card.dataset.key!);
	}, 1000);

	return {
		update(next: ReadOnScrollOptions) {
			current = next;
		},
		destroy() {
			clearInterval(idle);
			pane.removeEventListener('scroll', onScroll);
		}
	};
}
