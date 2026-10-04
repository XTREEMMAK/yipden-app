import type { TextSelector } from './types.js';

/**
 * A link that opens a creator's page scrolled to a kept passage: a Text Fragment
 * (`#:~:text=start,end`), which Chrome, Android's WebView and Safari follow, and any other
 * browser ignores, opening the page at the top.
 *
 * A short passage is given whole. A long one is given as its first and last few words, which
 * matches the same run of text without putting the whole passage in the address. The selector's
 * prefix and suffix stay out: a selection that starts or ends mid-word would make the browser
 * match nothing, and a passage that repeats still lands on its first occurrence, on the right
 * page.
 */

const WHOLE_UP_TO = 80;
const EDGE_WORDS = 4;

/** Encoded for a text directive, where `-`, `,` and `&` are syntax. */
const encode = (value: string) =>
	encodeURIComponent(value).replace(/-/g, '%2D').replace(/,/g, '%2C');

export function textFragmentUrl(pageUrl: string, selector: TextSelector): string {
	const base = pageUrl.replace(/#.*$/, '');
	const words = selector.exact.split(/\s+/).filter(Boolean);
	const directive =
		selector.exact.length <= WHOLE_UP_TO || words.length <= EDGE_WORDS * 2
			? encode(words.join(' '))
			: `${encode(words.slice(0, EDGE_WORDS).join(' '))},${encode(words.slice(-EDGE_WORDS).join(' '))}`;
	return `${base}#:~:text=${directive}`;
}
