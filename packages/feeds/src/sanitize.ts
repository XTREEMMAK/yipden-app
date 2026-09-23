import { absoluteUrl } from './urls.js';
import { decodeEntities, tokenize, VOID_ELEMENTS } from './tokenize.js';

// Re-exported so callers that sanitize also have entity decoding without a second import.
export { decodeEntities } from './tokenize.js';

/**
 * HTML sanitizing, for markup that arrived from a stranger's server.
 *
 * The approach is an allowlist re-serializer, not a filter: the input is tokenized, and the
 * output is built from scratch out of elements and attributes that are known to be safe, with
 * all text escaped on the way out. Nothing is ever passed through as a raw substring, so a
 * construct the tokenizer did not understand cannot be smuggled into the output intact. That is
 * the difference that matters against mutation XSS, where a browser re-parses markup a filter
 * approved and reaches a different tree than the filter saw.
 *
 * v0.9 renders plain text everywhere, so `htmlToText` is the function the app actually calls.
 * `sanitizeHtml` exists because `Item.contentHtml` is part of the specified shape and a later
 * reader view will want it: it is defense in depth today rather than the only line.
 */

/** Elements kept, with the attributes allowed on each. Everything else is dropped. */
const ALLOWED: Record<string, readonly string[]> = {
	a: ['href', 'title'],
	abbr: ['title'],
	b: [],
	blockquote: [],
	br: [],
	cite: [],
	code: [],
	dd: [],
	del: [],
	dl: [],
	dt: [],
	em: [],
	figcaption: [],
	figure: [],
	h1: [],
	h2: [],
	h3: [],
	h4: [],
	h5: [],
	h6: [],
	hr: [],
	i: [],
	img: ['src', 'alt', 'title', 'width', 'height'],
	ins: [],
	li: [],
	mark: [],
	ol: ['start'],
	p: [],
	pre: [],
	q: [],
	s: [],
	small: [],
	strong: [],
	sub: [],
	sup: [],
	table: [],
	tbody: [],
	td: [],
	tfoot: [],
	th: [],
	thead: [],
	tr: [],
	u: [],
	ul: []
};

/** Elements whose contents go with them, because the contents are the payload. */
const DROP_CONTENT = new Set([
	'script',
	'style',
	'template',
	'noscript',
	'iframe',
	'frame',
	'frameset',
	'object',
	'embed',
	'applet',
	'svg',
	'math',
	'canvas',
	'audio',
	'video',
	'form',
	'select',
	'textarea',
	'button',
	'input',
	'base',
	'link',
	'meta',
	'title',
	'head'
]);

/** Elements that introduce a line break when markup is flattened to text. */
const BLOCK_ELEMENTS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'br',
	'dd',
	'div',
	'dl',
	'dt',
	'figcaption',
	'figure',
	'footer',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'table',
	'tr',
	'ul'
]);

function escapeText(input: string): string {
	return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(input: string): string {
	return escapeText(input).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface SanitizeOptions {
	/** Relative URLs in the markup resolve against this, as they would on the source page. */
	baseUrl?: string;
	/** Hard cap on the output, because a feed can send an arbitrarily large document. */
	maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 200_000;

function cleanAttributes(
	name: string,
	attributes: Record<string, string>,
	baseUrl: string | undefined
): string {
	const allowed = ALLOWED[name] ?? [];
	const parts: string[] = [];

	for (const attribute of allowed) {
		const value = attributes[attribute];
		if (value === undefined || value === '') continue;

		if (attribute === 'href' || attribute === 'src') {
			const url = absoluteUrl(value, baseUrl);
			if (!url) continue;
			parts.push(`${attribute}="${escapeAttribute(url)}"`);
			continue;
		}
		if (attribute === 'width' || attribute === 'height' || attribute === 'start') {
			if (!/^\d{1,6}$/.test(value.trim())) continue;
			parts.push(`${attribute}="${value.trim()}"`);
			continue;
		}
		parts.push(`${attribute}="${escapeAttribute(value)}"`);
	}

	// A link with no destination left is not a link; the caller renders its text instead.
	if (name === 'a') {
		if (!parts.some((part) => part.startsWith('href='))) return '';
		parts.push('rel="noopener noreferrer"');
	}
	if (name === 'img' && !parts.some((part) => part.startsWith('src='))) return '';

	return parts.length ? ` ${parts.join(' ')}` : '';
}

/**
 * Rebuild markup out of the parts that are safe to keep.
 *
 * Disallowed elements lose their tags but keep their text, except for the ones whose contents
 * are the whole problem. Unclosed elements are closed at the end, so the output cannot leak
 * structure into whatever it is rendered beside.
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
	const { baseUrl, maxLength = DEFAULT_MAX_LENGTH } = options;
	const tokens = tokenize(html.slice(0, maxLength * 2));
	const output: string[] = [];
	const open: string[] = [];
	let dropDepth = 0;
	let dropTag = '';

	for (const token of tokens) {
		if (dropDepth > 0) {
			if (token.type === 'start' && token.name === dropTag && !token.selfClosing) dropDepth += 1;
			else if (token.type === 'end' && token.name === dropTag) dropDepth -= 1;
			continue;
		}

		if (token.type === 'text') {
			output.push(escapeText(decodeEntities(token.value)));
			continue;
		}

		if (token.type === 'start') {
			if (DROP_CONTENT.has(token.name)) {
				if (!token.selfClosing) {
					dropDepth = 1;
					dropTag = token.name;
				}
				continue;
			}
			if (!(token.name in ALLOWED)) continue;

			const attributes = cleanAttributes(token.name, token.attributes, baseUrl);
			if (token.name === 'a' && !attributes) continue;
			if (token.name === 'img' && !attributes) continue;

			output.push(`<${token.name}${attributes}>`);
			if (!token.selfClosing) open.push(token.name);
			continue;
		}

		if (!(token.name in ALLOWED) || VOID_ELEMENTS.has(token.name)) continue;
		const index = open.lastIndexOf(token.name);
		if (index === -1) continue;
		// Close everything opened inside it too, rather than emitting crossed tags.
		for (let i = open.length - 1; i >= index; i -= 1) {
			output.push(`</${open[i]}>`);
		}
		open.length = index;
	}

	for (let i = open.length - 1; i >= 0; i -= 1) {
		output.push(`</${open[i]}>`);
	}

	return output.join('').slice(0, maxLength).trim();
}

/** Stands in for an element boundary while text is being flattened. */
const BREAK = '\u0000';

export interface TextOptions {
	maxLength?: number;
}

/**
 * Flatten markup to plain text.
 *
 * This is what v0.9 renders. Block elements become line breaks so a run of paragraphs does not
 * turn into one run-on sentence, then whitespace is collapsed.
 */
export function htmlToText(html: string, options: TextOptions = {}): string {
	const { maxLength = 5000 } = options;
	const parts: string[] = [];
	let dropDepth = 0;
	let dropTag = '';

	for (const token of tokenize(html.slice(0, maxLength * 20))) {
		if (dropDepth > 0) {
			if (token.type === 'start' && token.name === dropTag && !token.selfClosing) dropDepth += 1;
			else if (token.type === 'end' && token.name === dropTag) dropDepth -= 1;
			continue;
		}
		if (token.type === 'text') {
			// Whitespace inside a text node is whitespace, newlines included: only an element
			// boundary makes a line break, which is how the markup would have rendered.
			parts.push(decodeEntities(token.value).replace(/\s+/g, ' '));
			continue;
		}
		if (token.type === 'start' && DROP_CONTENT.has(token.name) && !token.selfClosing) {
			dropDepth = 1;
			dropTag = token.name;
			continue;
		}
		if (BLOCK_ELEMENTS.has(token.name)) parts.push(BREAK);
	}

	return parts
		.join('')
		.replace(new RegExp(` *${BREAK} *`, 'g'), '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/ {2,}/g, ' ')
		.trim()
		.slice(0, maxLength);
}

/** A one or two line lede for a card, with no line breaks left in it. */
export function summarize(html: string, maxLength = 280): string {
	const text = htmlToText(html).replace(/\s+/g, ' ').trim();
	if (text.length <= maxLength) return text;
	const cut = text.slice(0, maxLength);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}
