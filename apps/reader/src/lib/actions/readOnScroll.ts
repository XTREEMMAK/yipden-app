/**
 * Reports each card that has scrolled out of view past the top of its pane, once it had been seen.
 *
 * "Seen first" matters: a card that starts above the viewport (a restored scroll position, a list
 * that re-rendered) was never read, and must not be counted as read because it is out of sight.
 * It does not depend on the card stack's motion, so it keeps working for reduced motion.
 */
export interface ReadOnScrollOptions {
	enabled: () => boolean;
	onRead: (key: string) => void;
}

const SELECTOR = '.yip-stack[data-key]';

export function readOnScroll(pane: HTMLElement, options: ReadOnScrollOptions) {
	let current = options;
	const seen = new Set<string>();
	const observed = new WeakSet<Element>();

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const key = (entry.target as HTMLElement).dataset.key;
				if (!key) continue;
				if (entry.isIntersecting) {
					seen.add(key);
					continue;
				}
				const top = entry.rootBounds?.top ?? 0;
				if (seen.has(key) && entry.boundingClientRect.bottom <= top && current.enabled()) {
					seen.delete(key);
					current.onRead(key);
				}
			}
		},
		{ root: pane }
	);

	const observeAll = () => {
		for (const node of pane.querySelectorAll(SELECTOR)) {
			if (observed.has(node)) continue;
			observed.add(node);
			observer.observe(node);
		}
	};
	observeAll();

	// Cards arrive as panes load and refresh; only new ones are added, so a re-render never
	// replays the ones already being watched.
	const mutations = new MutationObserver(observeAll);
	mutations.observe(pane, { childList: true, subtree: true });

	return {
		update(next: ReadOnScrollOptions) {
			current = next;
		},
		destroy() {
			observer.disconnect();
			mutations.disconnect();
		}
	};
}
