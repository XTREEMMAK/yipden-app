import { diagnostics } from '../diagnostics.svelte.js';
import { prefersReducedMotion } from '../motion.js';
import { picturesOf, predecode } from './predecode.js';
import '../styles/card-stack.css';

/**
 * Feeds' 3D card stack: cards stand up as they rise from the bottom of a pane, pin at the
 * top, then tip back behind the next card and fade.
 *
 * A card is held at the top by `position: sticky` (see styles/card-stack.css, which also says
 * what the three boxes of a card are for), and this action sets its tip, sink and fade on its
 * `.yip-fold` each frame: a passive scroll listener schedules one `requestAnimationFrame`, and
 * only cards near the viewport are touched. Because the scroller does the pinning, a frame's lag
 * here cannot make a card shake. It also marks a card `behind` once it is more than half folded
 * away, so it stops taking taps (see `isBehind`).
 *
 * The same fold exists as scroll-driven CSS (`animation-timeline: view()`), which costs no
 * JavaScript per frame. It is not what ships: on a phone (WebView 153) it juddered on every
 * launch after the first, with main-thread frames on time, and this path did not. A debug build
 * can switch it on to compare.
 *
 * Reduced motion disables the whole thing: the pane stays the flat list it already renders,
 * cards keep their normal inline layout, and this action does nothing at all.
 */

const DIM_PEAK = 0.6;
/** How far a folding card sinks below its pinned spot by the time it has faded, in px. */
const EXIT_SINK = 32;

function supportsScrollDrivenAnimation(): boolean {
	if (typeof CSS === 'undefined' || !CSS.supports) return false;
	try {
		return (
			CSS.supports('animation-timeline: view()') && CSS.supports('view-timeline-inset: 0px 10px')
		);
	} catch {
		return false;
	}
}

function resetCard(card: HTMLElement): void {
	card.style.transform = '';
	card.style.transformOrigin = '';
	card.style.opacity = '';
	card.style.visibility = '';
	card.style.removeProperty('--dim');
}

function dockPx(pane: HTMLElement): number {
	const value = getComputedStyle(pane.closest('.app') ?? pane).getPropertyValue('--dock');
	return parseFloat(value) || 88;
}

export type CardPlacement = {
	transformOrigin: '50% 0%' | '50% 100%';
	transform: string;
	opacity: number;
	dim: number;
} | null;

/**
 * The transform for one card at a given scroll position, as plain numbers in and a plain
 * description out, so the geometry is checkable without a real layout engine behind it.
 *
 * `relative` is the card's offset from the top of the pane's own visible area (`offsetTop`
 * minus `scrollTop`), matching the coordinate space `layoutFallback` reads off the DOM. A null
 * result means the card is far enough outside the viewport to leave alone entirely, mirroring
 * the scroll-driven CSS path where an out-of-range card simply is not the entry or exit phase
 * of its own view-timeline.
 */
export function cardPlacement(
	relative: number,
	height: number,
	viewport: number,
	/** False keeps a rising card flat and opaque: see `CardStackOptions.flatEntry`. */
	tiltIn = true
): CardPlacement {
	if (height <= 0) return null;
	const pin = pinOffset(height, viewport);
	if (relative < pin - height - 40 || relative > viewport + height) return null;

	if (relative < pin) {
		// Rising off the top: tip back and dim as it goes.
		const exit = Math.min(1, (pin - relative) / height);
		return {
			transformOrigin: '50% 0%',
			// The sink is outside the perspective, so it is not shrunk with the card (see the CSS).
			transform: `translateY(${EXIT_SINK * exit}px) perspective(1000px) translateZ(${-180 * exit}px) rotateX(${-10 * exit}deg)`,
			opacity: 1 - exit,
			dim: DIM_PEAK * exit
		};
	}

	// A card taller than the screen stands up over one screen of its own, from a hinge at its top,
	// since its bottom edge is still out of sight; any other card from its own bottom edge.
	const span = Math.min(height, viewport);
	if (tiltIn && relative > viewport - span) {
		// Rising from the bottom.
		const entry = Math.max(0, Math.min(1, (viewport - relative) / span));
		return {
			transformOrigin: pin < 0 ? '50% 0%' : '50% 100%',
			transform: `perspective(1000px) translateY(${24 * (1 - entry)}px) rotateX(${14 * (1 - entry)}deg) scale(${0.94 + 0.06 * entry})`,
			opacity: 0.5 + 0.5 * entry,
			dim: 0
		};
	}

	// Resting in the middle of the viewport: no transform at all.
	return { transformOrigin: '50% 0%', transform: 'none', opacity: 1, dim: 0 };
}

/**
 * Whether a card has gone behind: folded more than halfway, so mostly faded, tipped and dimmed.
 * Only then does it stop taking taps. A card that has just pinned at the top is still the front
 * card and wholly readable, and a card rising from the bottom is on its way to the front: both
 * keep their buttons. Where the next card overlaps a pinned one, the next card is drawn on top
 * and takes the tap anyway, so nothing else needs refusing.
 */
export function isBehind(relative: number, height: number, viewport = Infinity): boolean {
	return height > 0 && relative < pinOffset(height, viewport) - height / 2;
}

/**
 * Where a card is held while it folds, as its top edge's offset from the top of the pane: 0 for a
 * card that fits, so it pins at the top; negative for one taller than the visible area, so it
 * pins only once its bottom edge reaches the bottom of it. A tall card (a post with a video in it,
 * a long text post, a grouped crosspost) scrolls normally until all of it has been seen, and only
 * then folds away (phone feedback, 2026-10-06: its lower part could not be reached).
 */
export function pinOffset(height: number, viewport: number): number {
	return Math.min(0, viewport - height);
}

/** The box that is drawn and folded; the card's own place in the list is never moved. */
function foldOf(card: HTMLElement): HTMLElement {
	return card.querySelector<HTMLElement>('.yip-fold') ?? card;
}

/**
 * Fold every card touching the viewport by hand, the rAF fallback's whole job.
 *
 * Only cards within one card height of the pane's visible area are touched; everything else
 * either keeps its already-computed style (if still mid-transition) or is left alone.
 */
function layoutFallback(pane: HTMLElement): void {
	if (__YIPDEN_DEBUG__ && diagnostics?.noFold) return;
	const scrollTop = pane.scrollTop;
	const viewport = pane.clientHeight - dockPx(pane);
	const tiltIn = !pane.classList.contains('stack-flat');

	for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack')) {
		const fold = foldOf(card);
		const height = card.offsetHeight;
		const relative = card.offsetTop - scrollTop;
		const pin = pinOffset(height, viewport);
		// The scroller holds it there, as it holds any card at the top; only the offset differs.
		const top = pin < 0 ? `${pin}px` : '';
		if (fold.style.top !== top) fold.style.top = top;
		const placement = cardPlacement(relative, height, viewport, tiltIn);
		card.classList.toggle('behind', isBehind(relative, height, viewport));

		/*
		 * Folded away. Its place has left the top of the pane, but the drawn card is still held
		 * there by its rail for another screen of scrolling, so it has to stay gone: put back to
		 * its resting style here, every folded card reappeared at the top as a ghost.
		 */
		if (relative <= pin - height) {
			if (fold.style.visibility !== 'hidden') {
				resetCard(fold);
				fold.style.opacity = '0';
				fold.style.visibility = 'hidden';
			}
			continue;
		}

		if (!placement || placement.transform === 'none') {
			if (fold.style.transform || fold.style.visibility) resetCard(fold);
			continue;
		}

		fold.style.visibility = '';
		fold.style.transformOrigin = placement.transformOrigin;
		fold.style.transform = placement.transform;
		fold.style.opacity = String(placement.opacity);
		if (placement.dim > 0) fold.style.setProperty('--dim', String(placement.dim));
		else fold.style.removeProperty('--dim');
	}
}

export interface CardStackOptions {
	/**
	 * False for a pane that is mounted but not the one on screen (Feeds keeps all four). Its cards
	 * then carry no scroll-driven animation, which is what gives each one, and its dim overlay, a
	 * layer of its own on the compositor: three hidden panes were several hundred layers nobody
	 * could see. Defaults to true.
	 */
	active?: boolean;
	/**
	 * True brings a card up the screen as it is, flat and opaque, and keeps only the fold away at
	 * the top. A card rises over its own height (up to a screen), so a tall one, like a site in
	 * Surf with its preview, spent half a screen tipped back and see-through over the card pinned
	 * behind it: two cards printed on top of each other, one of them leaning. Defaults to false.
	 */
	flatEntry?: boolean;
}

export function cardStack(pane: HTMLElement, options: CardStackOptions = {}) {
	if (prefersReducedMotion()) return {};

	const useScrollDriven =
		__YIPDEN_DEBUG__ && diagnostics?.cssStack === true && supportsScrollDrivenAnimation();
	let active = options.active !== false;
	pane.classList.add('stack');
	if (options.flatEntry) pane.classList.add('stack-flat');

	/*
	 * Feeds changes pane in one frame, with no slide, so the classes change in that same frame: the
	 * pane coming on screen is never seen flat, and the one leaving is already out of sight.
	 */
	function setActive(next: boolean): void {
		active = next;
		pane.classList.toggle('stack-pin', active);
		pane.classList.toggle('stack-sda', active && useScrollDriven);
		if (useScrollDriven) return;
		if (active) layoutFallback(pane);
		else
			for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack')) {
				resetCard(foldOf(card));
				foldOf(card).style.top = '';
				card.classList.remove('behind');
			}
	}

	/*
	 * The scroll-driven path (debug only) has no per-frame JavaScript to mark cards, so it keeps
	 * the observer, and the stricter rule it can express: behind as soon as the card's place leaves
	 * the top. The shipping path marks cards in `layoutFallback`, by `isBehind`.
	 */
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const pastTop = !!entry.rootBounds && entry.boundingClientRect.top < entry.rootBounds.top;
				entry.target.classList.toggle('behind', pastTop);
			}
		},
		{ root: pane, rootMargin: '-4px 0px 0px 0px', threshold: [0, 0.25, 0.5, 0.75, 0.98, 1] }
	);

	/*
	 * Pictures decoded ahead: a card within two and a half screens below the one being read has its
	 * pictures decoded now, off the main thread, so its first draw does not wait for the decoder.
	 */
	const nearObserver =
		__YIPDEN_DEBUG__ && diagnostics?.noPredecode
			? null
			: new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (!entry.isIntersecting || !active) continue;
							nearObserver?.unobserve(entry.target);
							predecode(picturesOf(entry.target as HTMLElement));
						}
					},
					{ root: pane, rootMargin: '0px 0px 250% 0px' }
				);

	/*
	 * Room after the last card so it can scroll all the way to the top, leaving the card before it
	 * fully tipped away instead of half hidden behind it. How much depends on the last card's own
	 * height, which varies (media, text, grouped), and on anything that follows it before the tail
	 * (a ring's "hidden as not for me" note), so it is measured rather than guessed.
	 */
	const tailObserver = new ResizeObserver(sizeTail);
	function sizeTail(): void {
		const tail = pane.querySelector<HTMLElement>('.stack-tail');
		const cards = pane.querySelectorAll<HTMLElement>('.yip-stack');
		const last = cards[cards.length - 1];
		if (!tail || !last) return;
		const style = getComputedStyle(pane);
		const content =
			pane.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
		// From the last card's top edge to where the tail starts: the card, and whatever follows it.
		const below =
			tail.offsetParent === last.offsetParent
				? tail.offsetTop - last.offsetTop
				: last.offsetHeight + (parseFloat(style.rowGap) || 0);
		tail.style.height = `${Math.max(0, content - below)}px`;
	}

	/*
	 * Only when the cards themselves changed. The watcher below also hears every change inside a
	 * card (a thumbnail's zoom badge arriving with its picture, a bar appearing), and starting over
	 * for each of those re-observed every card and measured the pane again, in the middle of a
	 * scroll, once per picture.
	 */
	let observed: HTMLElement[] | null = null;
	function observeCards(): void {
		const cards = [...pane.querySelectorAll<HTMLElement>('.yip-stack')];
		if (observed?.length === cards.length && cards.every((card, at) => card === observed![at])) {
			return;
		}
		observed = cards;
		observer.disconnect();
		tailObserver.disconnect();
		nearObserver?.disconnect();
		for (const card of cards) nearObserver?.observe(card);
		if (useScrollDriven) for (const card of cards) observer.observe(card);
		const last = cards[cards.length - 1];
		if (last) tailObserver.observe(last);
		tailObserver.observe(pane);
		sizeTail();
		// New cards arrive at their resting style; fold whichever of them are already past the top.
		if (active && !useScrollDriven) layoutFallback(pane);
	}
	observeCards();

	// Yips arrive asynchronously (storage, then a refresh); watch for the pane's content
	// changing so newly rendered cards are observed too, without the page needing to know.
	const mutationObserver = new MutationObserver(observeCards);
	mutationObserver.observe(pane, { childList: true, subtree: true });

	let pending = false;
	function onScroll(): void {
		if (useScrollDriven || !active || pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			layoutFallback(pane);
		});
	}
	pane.addEventListener('scroll', onScroll, { passive: true });
	setActive(active);

	return {
		update(next: CardStackOptions = {}) {
			setActive(next.active !== false);
		},
		destroy() {
			observer.disconnect();
			nearObserver?.disconnect();
			mutationObserver.disconnect();
			tailObserver.disconnect();
			pane.removeEventListener('scroll', onScroll);
			pane.classList.remove('stack', 'stack-pin', 'stack-sda');
			for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack')) {
				resetCard(foldOf(card));
				foldOf(card).style.top = '';
				card.classList.remove('behind');
			}
		}
	};
}
