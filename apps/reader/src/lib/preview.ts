import { htmlToText } from '@yipden/feeds';
import type { RingEntry } from '@yipden/ring-client';

/**
 * A ring field as words: some members write their excerpt (or a caption) as HTML, `<p>` and all,
 * and it was shown with its tags in it (phone feedback, 2026-10-07). Only text that has markup is
 * converted, by the same sanitizing reader feeds go through, so plain text keeps its own line
 * breaks.
 */
function words(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	return /<\/?[a-z][^>]*>/i.test(value) ? htmlToText(value) : value;
}

/**
 * What a reader can do with a member without leaving the app, decided from what the ring
 * actually publishes for that member's type. Audio has playable `tracks[]`; comics, art and text
 * publish pages, artworks and excerpts that a viewer can page through; a game publishes a
 * `preview_url` and `trailer_url`, which are links out. A member with none of these has no
 * preview at all, and the button is simply absent rather than disabled.
 */

export interface Slide {
	image?: string;
	/** Alt text for `image`; decorative art with no description gets an empty alt. */
	alt?: string;
	title?: string;
	text?: string;
	caption?: string;
}

export type Preview =
	| { kind: 'play'; label: string }
	| { kind: 'view'; label: string; slides: Slide[] }
	| { kind: 'link'; label: string; url: string };

export function previewFor(entry: RingEntry): Preview | null {
	if ((entry.tracks?.length ?? 0) > 0) return { kind: 'play', label: 'Play' };

	const pages = (entry.pages ?? []).map<Slide>((page) => ({
		image: page.image_url,
		alt: words(page.caption) ?? '',
		...(page.caption ? { caption: words(page.caption)! } : {})
	}));
	if (pages.length) return { kind: 'view', label: 'Read a preview', slides: pages };

	const artworks = (entry.artworks ?? []).map<Slide>((art) => {
		const caption = [words(art.medium), words(art.year)].filter(Boolean).join(' · ');
		return { image: art.image_url, alt: words(art.alt) ?? '', ...(caption ? { caption } : {}) };
	});
	if (artworks.length) return { kind: 'view', label: 'View artwork', slides: artworks };

	const excerpts = (entry.excerpts ?? []).map<Slide>((excerpt) => ({
		text: words(excerpt.text) ?? '',
		...(excerpt.title ? { title: words(excerpt.title)! } : {})
	}));
	if (excerpts.length) return { kind: 'view', label: 'Read a sample', slides: excerpts };

	if (entry.trailer_url) return { kind: 'link', label: 'Watch trailer', url: entry.trailer_url };
	if (entry.preview_url) return { kind: 'link', label: 'Preview', url: entry.preview_url };
	return null;
}
