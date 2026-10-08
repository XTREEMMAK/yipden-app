/**
 * Debug-build switches for finding what makes a partner ring's scroll judder on a real phone,
 * where desktop profiling cannot reproduce it: each one turns a single suspect off, and the frame
 * meter says how many frames ran late during the last scroll. Every use is behind
 * `__YIPDEN_DEBUG__`, so a release build reads none of them.
 */

import { picturesOf } from './actions/pictures.js';

export const DIAG_KEYS = {
	meter: 'yipden:diag:meter',
	noStack: 'yipden:diag:noStack',
	cssStack: 'yipden:diag:cssStack',
	noBackdrop: 'yipden:diag:noBackdrop',
	noThumbs: 'yipden:diag:noThumbs',
	noCardGlass: 'yipden:diag:noCardGlass',
	eagerCards: 'yipden:diag:eagerCards',
	noLibraryThumbs: 'yipden:diag:noLibraryThumbs',
	noDownscale: 'yipden:diag:noDownscale',
	noFold: 'yipden:diag:noFold'
} as const;

export type DiagKey = keyof typeof DIAG_KEYS;

function read(key: DiagKey): boolean {
	try {
		return localStorage.getItem(DIAG_KEYS[key]) === '1';
	} catch {
		return false;
	}
}

class Diagnostics {
	meter = $state(read('meter'));
	noStack = $state(read('noStack'));
	/** Fold the stack with scroll-driven CSS instead of from JavaScript each frame. */
	cssStack = $state(read('cssStack'));
	noBackdrop = $state(read('noBackdrop'));
	noThumbs = $state(read('noThumbs'));
	/** Feeds: no glass behind a post that shares a video. */
	noCardGlass = $state(read('noCardGlass'));
	/** Feeds: every card drawn up front, instead of as it nears the screen. */
	eagerCards = $state(read('eagerCards'));
	/** Library: an icon in place of each kept picture. */
	noLibraryThumbs = $state(read('noLibraryThumbs'));
	/** Feeds: draw each card's picture as it is, not shrunk first. */
	noDownscale = $state(read('noDownscale'));
	/** Cards keep their place but no tilt, fade or dim as they move: tests the fold itself. */
	noFold = $state(read('noFold'));

	set(key: DiagKey, on: boolean): void {
		this[key] = on;
		try {
			if (on) localStorage.setItem(DIAG_KEYS[key], '1');
			else localStorage.removeItem(DIAG_KEYS[key]);
		} catch {
			// No storage: the switch still holds for this session.
		}
	}
}

/** Null in a release build, so the bundler drops the class, its keys and everything reading them. */
export const diagnostics: Diagnostics | null = __YIPDEN_DEBUG__ ? new Diagnostics() : null;

export interface ScrollReport {
	frames: number;
	/** Frames that took more than 20ms, roughly one missed refresh or worse at 60Hz. */
	slow: number;
	worst: number;
	/** Which card stack the pane is running: scroll-driven CSS, or the per-frame JS fallback. */
	stack: 'css' | 'js' | 'off';
	/**
	 * Where the worst frame went, when the WebView says (Chrome's long-animation-frame, frames over
	 * 50ms): running script, style and drawing work, and everything else, which is waiting for the
	 * picture decoder, the GPU and the compositor.
	 */
	split?: { script: number; render: number; other: number };
	/**
	 * The card at the bottom edge when the worst frame ran: its place in the pane, what kind of card,
	 * and the pixel size of each picture it draws (filled in a moment after the rest).
	 */
	card?: { index: number; of: number; what: string; pictures: string[] };
}

/**
 * Times every animation frame while `pane` is scrolling, and reports once it has been still for
 * a moment. Main-thread frames only, which is where a judder from style, layout, decode or script
 * shows up; it cannot see a compositor-only hitch.
 */
export function frameMeter(pane: HTMLElement | Window, onReport: (report: ScrollReport) => void) {
	let raf = 0;
	let last = 0;
	let quietSince = 0;
	let frames: number[] = [];
	let tops: number[] = [];
	let longest: PerformanceEntry | null = null;
	let observer: PerformanceObserver | null = null;
	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (!longest || entry.duration > longest.duration) longest = entry;
			}
		});
		observer.observe({ type: 'long-animation-frame', buffered: false });
	} catch {
		// Not supported by this WebView: the report just has no split.
	}
	const describeCard = async (
		box: HTMLElement,
		scrollTop: number
	): Promise<ScrollReport['card'] | undefined> => {
		const cards = [...box.querySelectorAll<HTMLElement>('.yip-stack')];
		const edge = scrollTop + box.clientHeight;
		let index = -1;
		let gap = Infinity;
		cards.forEach((card, at) => {
			const distance = Math.abs(card.offsetTop - edge);
			if (distance < gap) {
				gap = distance;
				index = at;
			}
		});
		const card = cards[index];
		if (!card) return undefined;
		const inner = card.querySelector<HTMLElement>('.yip, .topic, .post');
		const what =
			[...(inner?.classList ?? [])].filter((name) => !name.startsWith('svelte-')).join(' ') ||
			'card';
		const sizes = await Promise.all(
			picturesOf(card).map(
				(url) =>
					new Promise<string>((resolve) => {
						const image = new Image();
						image.referrerPolicy = 'no-referrer';
						image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
						image.onerror = () => resolve('?');
						image.src = url;
						setTimeout(() => resolve('?'), 1500);
					})
			)
		);
		return { index, of: cards.length, what, pictures: sizes };
	};
	const splitOf = (entry: PerformanceEntry | null): ScrollReport['split'] | undefined => {
		const frame = entry as
			(PerformanceEntry & { renderStart?: number; scripts?: Array<{ duration: number }> }) | null;
		if (!frame || !frame.scripts) return undefined;
		const script = frame.scripts.reduce((sum, item) => sum + item.duration, 0);
		const render = frame.renderStart ? frame.startTime + frame.duration - frame.renderStart : 0;
		return {
			script: Math.round(script),
			render: Math.round(render),
			other: Math.max(0, Math.round(frame.duration - script - render))
		};
	};

	const tick = (now: number) => {
		if (last) {
			frames.push(now - last);
			tops.push('scrollTop' in pane ? pane.scrollTop : window.scrollY);
		}
		last = now;
		if (now - quietSince > 400) {
			raf = 0;
			last = 0;
			if (frames.length > 5) {
				const split = splitOf(longest);
				const worstAt = frames.indexOf(Math.max(...frames));
				const where = tops[worstAt] ?? 0;
				const base: ScrollReport = {
					...(split ? { split } : {}),
					frames: frames.length,
					slow: frames.filter((frame) => frame > 20).length,
					worst: Math.round(Math.max(...frames)),
					stack:
						'classList' in pane && pane.classList.contains('stack-sda')
							? 'css'
							: 'classList' in pane && pane.classList.contains('stack')
								? 'js'
								: 'off'
				};
				onReport(base);
				if (pane instanceof HTMLElement)
					void describeCard(pane, where).then((card) => {
						if (card) onReport({ ...base, card });
					});
			}
			frames = [];
			tops = [];
			longest = null;
			return;
		}
		raf = requestAnimationFrame(tick);
	};

	const onScroll = () => {
		quietSince = performance.now();
		if (!raf) raf = requestAnimationFrame(tick);
	};
	pane.addEventListener('scroll', onScroll, { passive: true });

	return () => {
		observer?.disconnect();
		pane.removeEventListener('scroll', onScroll);
		cancelAnimationFrame(raf);
	};
}
