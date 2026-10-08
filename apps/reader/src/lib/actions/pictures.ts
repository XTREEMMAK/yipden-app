/** Every picture a card draws: backgrounds and images, once each. For the debug frame meter. */
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
