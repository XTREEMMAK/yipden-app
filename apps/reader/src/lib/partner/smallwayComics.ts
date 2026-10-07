import type { PartnerCandidate } from '@yipden/ring-client';
import { livePartnerSource } from './live.js';

/**
 * Smallway's Comics Line (https://gusbus.space/smallweb-subway/comics/), one line of the Smallweb
 * Subway. Its members live in a script, `let DATA_comics = [ … ]`, which its page runs to draw
 * the list. Read as text and never run: the array is JSON apart from `//` comment lines (a member
 * taken off the line is commented out) and trailing commas, and addresses come without a scheme.
 */

export const SMALLWAY_COMICS_URL = 'https://gusbus.space/smallweb-subway.js/comics.js';

/**
 * Where the array that opens at `start` closes: the widget's own code follows it in the same file,
 * full of brackets of its own. Brackets inside strings and `//` comments do not count.
 */
function matchingBracket(text: string, start: number): number {
	if (start < 0) return -1;
	let depth = 0;
	for (let i = start; i < text.length; i += 1) {
		const char = text[i];
		if (char === '"' || char === "'") {
			const quote = char;
			for (i += 1; i < text.length && text[i] !== quote; i += 1) if (text[i] === '\\') i += 1;
		} else if (char === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i += 1;
		} else if (char === '[') depth += 1;
		else if (char === ']') {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}

interface SmallwayStop {
	title?: unknown;
	url?: unknown;
	owner?: unknown;
}

export function readSmallwayComics(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];
	const start = document.indexOf('[', Math.max(0, document.indexOf('DATA_comics')));
	const end = matchingBracket(document, start);
	if (start === -1 || end === -1) return [];
	const array = document
		.slice(start, end + 1)
		// Whole-line comments only: an address's own `//` is never at the start of a line.
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/,(\s*[\]}])/g, '$1');
	let stops: unknown;
	try {
		stops = JSON.parse(array);
	} catch {
		return [];
	}
	if (!Array.isArray(stops)) return [];
	return stops.flatMap((stop: SmallwayStop) => {
		if (!stop || typeof stop.url !== 'string' || typeof stop.title !== 'string') return [];
		const address = stop.url.trim();
		const url = /^[a-z]+:\/\//i.test(address) ? address : `https://${address}`;
		const owner = typeof stop.owner === 'string' ? stop.owner.trim() : '';
		return [{ name: stop.title, url, ...(owner ? { blurb: `By ${owner}` } : {}) }];
	});
}

export const smallwayComicsSource = livePartnerSource(
	{
		ring: {
			id: 'smallway-comics',
			name: 'Smallway: Comics Line',
			hubUrl: 'https://gusbus.space/smallweb-subway/comics/'
		},
		capabilities: [],
		read: readSmallwayComics
	},
	SMALLWAY_COMICS_URL
);
