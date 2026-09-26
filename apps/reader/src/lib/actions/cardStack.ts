import { prefersReducedMotion } from '../motion.js';

/**
 * Feeds' 3D card stack: cards stand up as they rise from the bottom of a pane, pin at the
 * top, then tip back behind the next card and fade.
 *
 * Scroll-driven CSS animations do the whole thing on the compositor, with no JavaScript per
 * frame, where `animation-timeline: view()` exists. This action's job there is small: attach
 * the `stack` class that the matching global stylesheet targets, and mark whichever card is
 * pinned at the top as `behind` so it stops taking taps, via an `IntersectionObserver` rather
 * than a scroll handler either way.
 *
 * Where scroll-driven animations do not exist, the same visual result is computed by hand: a
 * passive scroll listener schedules one `requestAnimationFrame` per frame, and only cards
 * within one card height of the viewport are touched, matching the brief's own cost bound.
 *
 * Reduced motion disables the whole thing: the pane stays the flat list it already renders,
 * cards keep their normal inline layout, and this action does nothing at all.
 */

const DIM_PEAK = 0.6;

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
export function cardPlacement(relative: number, height: number, viewport: number): CardPlacement {
	if (height <= 0) return null;
	if (relative < -height - 40 || relative > viewport + height) return null;

	if (relative < 0) {
		// Rising off the top: tip back and dim as it goes.
		const exit = Math.min(1, -relative / height);
		return {
			transformOrigin: '50% 0%',
			transform: `perspective(1000px) translateY(${exit * 100}%) translateZ(${-180 * exit}px) rotateX(${-10 * exit}deg)`,
			opacity: 1 - exit,
			dim: DIM_PEAK * exit
		};
	}

	if (relative > viewport - height) {
		// Rising from the bottom: stand up from a hinge at its own bottom edge.
		const entry = Math.max(0, Math.min(1, (viewport - relative) / height));
		return {
			transformOrigin: '50% 100%',
			transform: `perspective(1000px) translateY(${24 * (1 - entry)}px) rotateX(${14 * (1 - entry)}deg) scale(${0.94 + 0.06 * entry})`,
			opacity: 0.5 + 0.5 * entry,
			dim: 0
		};
	}

	// Resting in the middle of the viewport: no transform at all.
	return { transformOrigin: '50% 0%', transform: 'none', opacity: 1, dim: 0 };
}

/**
 * Position every card touching the viewport by hand, the rAF fallback's whole job.
 *
 * Only cards within one card height of the pane's visible area are touched; everything else
 * either keeps its already-computed style (if still mid-transition) or is left alone.
 */
function layoutFallback(pane: HTMLElement): void {
	const scrollTop = pane.scrollTop;
	const viewport = pane.clientHeight - dockPx(pane);

	for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack')) {
		const height = card.offsetHeight;
		const relative = card.offsetTop - scrollTop;
		const placement = cardPlacement(relative, height, viewport);

		if (!placement) {
			if (card.style.transform) resetCard(card);
			continue;
		}
		if (placement.transform === 'none') {
			if (card.style.transform) resetCard(card);
			continue;
		}

		card.style.transformOrigin = placement.transformOrigin;
		card.style.transform = placement.transform;
		card.style.opacity = String(placement.opacity);
		if (placement.dim > 0) card.style.setProperty('--dim', String(placement.dim));
		else card.style.removeProperty('--dim');
	}
}

export function cardStack(pane: HTMLElement) {
	if (prefersReducedMotion()) return {};

	const useScrollDriven = supportsScrollDrivenAnimation();
	pane.classList.add('stack');
	pane.classList.toggle('stack-sda', useScrollDriven);

	// The front card takes taps; anything pinned at the top and tipping back does not.
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const pastTop = !!entry.rootBounds && entry.boundingClientRect.top < entry.rootBounds.top;
				entry.target.classList.toggle('behind', pastTop);
			}
		},
		{ root: pane, rootMargin: '-4px 0px 0px 0px', threshold: [0, 0.25, 0.5, 0.75, 0.98, 1] }
	);

	function observeCards(): void {
		observer.disconnect();
		for (const card of pane.querySelectorAll('.yip-stack')) observer.observe(card);
	}
	observeCards();

	// Yips arrive asynchronously (storage, then a refresh); watch for the pane's content
	// changing so newly rendered cards are observed too, without the page needing to know.
	const mutationObserver = new MutationObserver(observeCards);
	mutationObserver.observe(pane, { childList: true, subtree: true });

	let pending = false;
	function onScroll(): void {
		if (useScrollDriven || pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			layoutFallback(pane);
		});
	}
	pane.addEventListener('scroll', onScroll, { passive: true });
	if (!useScrollDriven) layoutFallback(pane);

	return {
		destroy() {
			observer.disconnect();
			mutationObserver.disconnect();
			pane.removeEventListener('scroll', onScroll);
			pane.classList.remove('stack', 'stack-sda');
			for (const card of pane.querySelectorAll<HTMLElement>('.yip-stack')) {
				resetCard(card);
				card.classList.remove('behind');
			}
		}
	};
}
