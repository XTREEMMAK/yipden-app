/**
 * A picture in a frame (an avatar, a logo, a card's art), drawn as an `<img>` that sends no
 * referrer, in place of a CSS `background-image`.
 *
 * A background sends the page's referrer, and in the Android app that is `https://localhost/`,
 * which some hosts refuse: YouTube's channel avatars (`yt3.googleusercontent.com`) answer 429 to
 * it and 200 to no referrer at all, so every channel's avatar was blank on the phone (2026-10-14).
 * The page itself keeps its referrer, which the in-app embeds need; pictures do not.
 *
 * The frame keeps its own look: its shape (the picture takes its corner radius), and `cover` or
 * `contain` as its CSS asks for a background. A picture that fails is hidden, so the frame shows
 * whatever it shows with none.
 */
export function picture(node: HTMLElement, url: string | null | undefined) {
	let img: HTMLImageElement | null = null;

	function set(next: string | null | undefined): void {
		if (!next) {
			img?.remove();
			img = null;
			return;
		}
		if (!img) {
			const style = getComputedStyle(node);
			if (style.position === 'static') node.style.position = 'relative';
			// Its own stacking context, so the picture (z-index -1) sits over the frame's background
			// (a colour wash, say) and under anything else the frame holds: an initial, a button.
			node.style.isolation = 'isolate';
			img = document.createElement('img');
			img.alt = '';
			img.referrerPolicy = 'no-referrer';
			img.decoding = 'async';
			img.draggable = false;
			img.setAttribute('aria-hidden', 'true');
			Object.assign(img.style, {
				position: 'absolute',
				inset: '0',
				width: '100%',
				height: '100%',
				objectFit: style.backgroundSize === 'contain' ? 'contain' : 'cover',
				borderRadius: 'inherit',
				pointerEvents: 'none',
				zIndex: '-1'
			});
			const own = img;
			own.onerror = () => (own.hidden = true);
			own.onload = () => (own.hidden = false);
			node.prepend(own);
		}
		if (img.getAttribute('src') !== next) img.src = next;
	}

	set(url);
	return {
		update: set,
		destroy: () => img?.remove()
	};
}
