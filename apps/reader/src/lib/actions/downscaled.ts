import { diagnostics } from '../diagnostics.svelte.js';

/**
 * A card's picture, drawn at the size the card needs and not the size the photo was taken at.
 *
 * A phone photo behind a card (3002x4000, 12 megapixels) stalls the frame that first draws it for
 * 60 to 140ms, spent waiting on the decoder and the GPU, not on script (frame meter, 2026-10-08:
 * the slow frames landed on the cards with the biggest pictures). Decoding it ahead did not help:
 * what is drawn is a scaled copy, and a decode of the full picture is not that copy.
 *
 * So a large picture is shrunk by `createImageBitmap`, which decodes and resizes away from the main
 * thread, into a canvas of about a megapixel, and only that is drawn. A picture that is already
 * small is just set as the background. Cards far from the screen wait with their colour wash, and
 * one picture is worked on at a time.
 */

/** The long side, in pixels, past which a picture is shrunk. */
const SHRINK_ABOVE = 1100;
/** About what a shrunk picture is, in pixels: a card is under 400 CSS pixels wide. */
const MAX_PIXELS = 1_300_000;

let working = false;
const waiting: Array<() => Promise<void>> = [];

function pump(): void {
	if (working) return;
	const job = waiting.shift();
	if (!job) return;
	working = true;
	void job().finally(() => {
		working = false;
		pump();
	});
}

function schedule(job: () => Promise<void>): () => void {
	waiting.push(job);
	pump();
	return () => {
		const at = waiting.indexOf(job);
		if (at >= 0) waiting.splice(at, 1);
	};
}

function load(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.referrerPolicy = 'no-referrer';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('picture did not load'));
		image.src = url;
	});
}

export function downscaled(node: HTMLElement, url: string | null) {
	let current: string | null = null;
	let cancel: (() => void) | null = null;
	let layer: HTMLElement | null = null;
	let observer: IntersectionObserver | null = null;
	let version = 0;

	function clear(): void {
		cancel?.();
		cancel = null;
		observer?.disconnect();
		observer = null;
		layer?.remove();
		layer = null;
	}

	function show(child: HTMLElement): void {
		layer?.remove();
		layer = child;
		node.append(child);
	}

	function plain(src: string): void {
		const child = document.createElement('span');
		child.className = 'pic';
		child.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
		show(child);
	}

	async function draw(src: string, mine: number): Promise<void> {
		try {
			const image = await load(src);
			if (mine !== version) return;
			const long = Math.max(image.naturalWidth, image.naturalHeight);
			if (long <= SHRINK_ABOVE) return plain(src);
			const scale = Math.min(
				SHRINK_ABOVE / image.naturalWidth,
				Math.sqrt(MAX_PIXELS / (image.naturalWidth * image.naturalHeight)),
				1
			);
			const width = Math.max(1, Math.round(image.naturalWidth * scale));
			const height = Math.max(1, Math.round(image.naturalHeight * scale));
			const bitmap = await createImageBitmap(image, {
				resizeWidth: width,
				resizeHeight: height,
				resizeQuality: 'medium'
			});
			if (mine !== version) {
				bitmap.close();
				return;
			}
			const canvas = document.createElement('canvas');
			canvas.className = 'pic';
			canvas.width = width;
			canvas.height = height;
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
			bitmap.close();
			show(canvas);
		} catch {
			// Not shrinkable here
			if (mine === version) plain(src);
		}
	}

	function apply(next: string | null): void {
		clear();
		current = next;
		version += 1;
		if (!next) return;
		if (__YIPDEN_DEBUG__ && diagnostics?.noDownscale) return plain(next);
		const mine = version;
		const start = () => {
			cancel = schedule(() => draw(next, mine));
		};
		const pane = node.closest<HTMLElement>('.pane');
		if (typeof IntersectionObserver === 'undefined') return start();
		observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer?.disconnect();
				observer = null;
				start();
			},
			{ root: pane, rootMargin: '150% 0px 300% 0px' }
		);
		observer.observe(node);
	}

	apply(url);
	return {
		update(next: string | null) {
			if (next !== current) apply(next);
		},
		destroy() {
			version += 1;
			clear();
		}
	};
}
