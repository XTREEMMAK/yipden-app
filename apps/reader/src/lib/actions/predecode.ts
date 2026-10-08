/**
 * Decodes a card's pictures before the card reaches the screen.
 *
 * A picture is decoded the first time it is drawn, and a full-size photo behind a card takes a
 * long frame to decode on a phone (80 to 110ms in Yips, 2026-10-08), the first time through a pane
 * only: scrolling the same cards again was smooth. `Image.decode()` does that work off the main
 * thread and keeps the result, so the frame that first draws the card finds it done. Two at a time,
 * so the decoding itself never competes with the scroll.
 */

const MAX_REMEMBERED = 400;
const PARALLEL = 2;

const done = new Set<string>();
const queue: string[] = [];
let running = 0;

function next(): void {
	while (running < PARALLEL && queue.length) {
		const url = queue.shift()!;
		running += 1;
		const image = new Image();
		image.referrerPolicy = 'no-referrer';
		image.decoding = 'async';
		image.src = url;
		void image
			.decode()
			.catch(() => {
				// A picture that does not load is the card's own business.
			})
			.finally(() => {
				running -= 1;
				next();
			});
	}
}

/** Every picture a card draws: backgrounds and images, once each. */
export function picturesOf(card: HTMLElement): string[] {
	const urls = new Set<string>();
	for (const el of card.querySelectorAll<HTMLElement>('[style*="background-image"]')) {
		const match = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage);
		if (match?.[2] && /^https?:|^data:|^\//.test(match[2])) urls.add(match[2]);
	}
	for (const img of card.querySelectorAll<HTMLImageElement>('img[src]'))
		urls.add(img.currentSrc || img.src);
	return [...urls];
}

export function predecode(urls: string[]): void {
	for (const url of urls) {
		if (done.has(url)) continue;
		done.add(url);
		if (done.size > MAX_REMEMBERED) done.delete(done.values().next().value as string);
		queue.push(url);
	}
	next();
}
