export const VOID_ELEMENTS = new Set(['br', 'hr', 'img']);

/**
 * A small, forgiving HTML tokenizer.
 *
 * Shared by the sanitizer and by feed discovery, which both need to walk markup from a
 * stranger's server without trusting any of it. Comments, CDATA, doctypes and processing
 * instructions are consumed and discarded rather than tokenized: none of them carry anything a
 * reader needs, and every one of them has been a parser confusion vector at some point.
 */

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '\u2013',
	mdash: '\u2014',
	hellip: '\u2026',
	lsquo: '\u2018',
	rsquo: '\u2019',
	ldquo: '\u201c',
	rdquo: '\u201d',
	bull: '\u2022',
	middot: '\u00b7',
	copy: '\u00a9',
	reg: '\u00ae',
	trade: '\u2122',
	deg: '\u00b0',
	laquo: '\u00ab',
	raquo: '\u00bb',
	eacute: '\u00e9',
	egrave: '\u00e8',
	agrave: '\u00e0',
	ccedil: '\u00e7',
	uuml: '\u00fc',
	ouml: '\u00f6',
	auml: '\u00e4',
	szlig: '\u00df',
	times: '\u00d7',
	divide: '\u00f7',
	frac12: '\u00bd',
	pound: '\u00a3',
	euro: '\u20ac',
	yen: '\u00a5',
	cent: '\u00a2',
	sect: '\u00a7',
	para: '\u00b6',
	dagger: '\u2020',
	permil: '\u2030',
	prime: '\u2032',
	larr: '\u2190',
	rarr: '\u2192',
	harr: '\u2194',
	infin: '\u221e',
	ne: '\u2260',
	le: '\u2264',
	ge: '\u2265'
};

/** Codepoints a browser silently remaps, plus the ones that must never reach the output. */
function codePointToString(code: number): string {
	if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
	// Surrogates and noncharacters are not text; dropping them avoids a malformed string.
	if (code >= 0xd800 && code <= 0xdfff) return '';
	try {
		return String.fromCodePoint(code);
	} catch {
		return '';
	}
}

/**
 * Decode character references.
 *
 * Deliberately conservative: an unrecognized named reference is left alone rather than guessed
 * at, because guessing is how `&lt;script` becomes `<script`.
 */
export function decodeEntities(input: string): string {
	return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi, (match, body: string) => {
		if (body.startsWith('#x') || body.startsWith('#X')) {
			return codePointToString(parseInt(body.slice(2), 16)) || match;
		}
		if (body.startsWith('#')) {
			return codePointToString(parseInt(body.slice(1), 10)) || match;
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? match;
	});
}

export type Token =
	| { type: 'text'; value: string }
	| { type: 'start'; name: string; attributes: Record<string, string>; selfClosing: boolean }
	| { type: 'end'; name: string };

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function parseAttributes(source: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
		const name = (match[1] ?? '').toLowerCase();
		if (!name) continue;
		let value = match[2] ?? '';
		if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
		attributes[name] = decodeEntities(value);
	}
	return attributes;
}

/**
 * Turn markup into a flat token list.
 *
 * Comments, CDATA, doctypes and processing instructions are consumed and discarded rather than
 * tokenized: none of them carry anything a reader needs, and every one of them has been a
 * parser confusion vector at some point.
 */
export function tokenize(html: string): Token[] {
	const tokens: Token[] = [];
	let cursor = 0;

	const pushText = (value: string) => {
		if (value) tokens.push({ type: 'text', value });
	};

	while (cursor < html.length) {
		const next = html.indexOf('<', cursor);
		if (next === -1) {
			pushText(html.slice(cursor));
			break;
		}
		pushText(html.slice(cursor, next));

		const rest = html.slice(next);
		if (rest.startsWith('<!--')) {
			const end = html.indexOf('-->', next + 4);
			cursor = end === -1 ? html.length : end + 3;
			continue;
		}
		if (rest.startsWith('<![CDATA[')) {
			const end = html.indexOf(']]>', next + 9);
			pushText(html.slice(next + 9, end === -1 ? html.length : end));
			cursor = end === -1 ? html.length : end + 3;
			continue;
		}
		if (rest.startsWith('<!') || rest.startsWith('<?')) {
			const end = html.indexOf('>', next);
			cursor = end === -1 ? html.length : end + 1;
			continue;
		}

		TAG_PATTERN.lastIndex = next;
		const tag = TAG_PATTERN.exec(html);
		if (!tag || tag.index !== next) {
			// A stray angle bracket, not a tag. It is text, and it will be escaped as text.
			pushText('<');
			cursor = next + 1;
			continue;
		}

		const name = (tag[2] ?? '').toLowerCase();
		if (tag[1] === '/') {
			tokens.push({ type: 'end', name });
		} else {
			tokens.push({
				type: 'start',
				name,
				attributes: parseAttributes(tag[3] ?? ''),
				selfClosing: tag[4] === '/' || VOID_ELEMENTS.has(name)
			});
		}
		cursor = TAG_PATTERN.lastIndex;
	}

	return tokens;
}
