import { byPublishedDescending } from '../dates.js';
import { feedKindFromUrl, refineKind } from '../kind.js';
import { FeedParseError, localName, parseFeedXml } from '../xml.js';
import { parseAtom } from './atom.js';
import { parseJsonFeed } from './jsonfeed.js';
import { parseRss } from './rss.js';
import { safeUrl } from '@yipden/ring-client';
import { tokenize } from '../tokenize.js';
import type { Item, ParsedFeed } from '../types.js';

export interface ParseOptions {
	/** The address the feed was fetched from, after redirects. Identity and link base. */
	feedUrl: string;
	/** The declared content type, used as a hint and never as the final word. */
	contentType?: string;
	maxItems?: number;
}

/**
 * Parse whatever came back, whatever it claims to be.
 *
 * The content type is a hint. Plenty of servers send `text/xml` for JSON Feed, or
 * `application/octet-stream` for everything, so the body decides and the header only breaks
 * ties. Sniffing here rather than in each caller means one place knows the formats exist.
 */
export function parseFeed(body: string, options: ParseOptions): ParsedFeed {
	const { feedUrl, contentType = '', maxItems } = options;
	const trimmed = body.trim();
	if (!trimmed) throw new FeedParseError('feed document is empty');

	const looksJson = trimmed.startsWith('{');
	const saysJson = contentType.toLowerCase().includes('json');

	let feed: ParsedFeed;
	if (looksJson || (saysJson && !trimmed.startsWith('<'))) {
		let json: unknown;
		try {
			json = JSON.parse(trimmed);
		} catch {
			throw new FeedParseError('feed document is not valid JSON');
		}
		feed = parseJsonFeed(json, { feedUrl, ...(maxItems ? { maxItems } : {}) });
	} else {
		const document = parseFeedXml(trimmed);
		const root = document.root;
		if (!root) throw new FeedParseError('feed document has no root element');

		const name = localName(root);
		if (name === 'feed') {
			feed = parseAtom(document, { feedUrl, ...(maxItems ? { maxItems } : {}) });
		} else if (name === 'rss' || name === 'rdf') {
			feed = parseRss(document, { feedUrl, ...(maxItems ? { maxItems } : {}) });
		} else {
			throw new FeedParseError(`unrecognized feed root element: ${root.name}`);
		}
	}

	for (const item of feed.items) addBodyImage(item);
	feed.items.sort(byPublishedDescending);
	feed.kind = refineKind(feedKindFromUrl(feedUrl), feed.items);
	return feed;
}

export { parseAtom } from './atom.js';
export { parseJsonFeed } from './jsonfeed.js';
export { parseRss } from './rss.js';

/** Below this many pixels on a side, an image is a tracking pixel, an emoji or an icon. */
const MIN_BODY_IMAGE_PX = 48;

/**
 * A post that declares no image of its own, but shows one in its body: that first real image
 * becomes its card's picture. Plenty of blogs never use media tags, so without this a post
 * with a photo drew as plain text. The body is already sanitized, so its addresses are
 * absolute and checked; they are checked again here all the same.
 */
export function addBodyImage(item: Item): void {
	if (!item.contentHtml || item.media.some((media) => media.kind === 'image')) return;
	for (const token of tokenize(item.contentHtml)) {
		if (token.type !== 'start' || token.name !== 'img') continue;
		const { src, alt, width, height } = token.attributes;
		const small = [width, height].some((side) => side && Number(side) < MIN_BODY_IMAGE_PX);
		const url = src ? safeUrl(src) : null;
		if (small || !url) continue;
		item.media.push({
			url: url.toString(),
			kind: 'image',
			...(alt?.trim() ? { alt: alt.trim() } : {})
		});
		return;
	}
}
