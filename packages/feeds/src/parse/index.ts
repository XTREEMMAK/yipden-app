import { byPublishedDescending } from '../dates.js';
import { feedKindFromUrl, refineKind } from '../kind.js';
import { FeedParseError, localName, parseFeedXml } from '../xml.js';
import { parseAtom } from './atom.js';
import { parseJsonFeed } from './jsonfeed.js';
import { parseRss } from './rss.js';
import type { ParsedFeed } from '../types.js';

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

	feed.items.sort(byPublishedDescending);
	feed.kind = refineKind(feedKindFromUrl(feedUrl), feed.items);
	return feed;
}

export { parseAtom } from './atom.js';
export { parseJsonFeed } from './jsonfeed.js';
export { parseRss } from './rss.js';
