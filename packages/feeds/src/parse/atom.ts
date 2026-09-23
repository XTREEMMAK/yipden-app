import type { XmlDocument, XmlElement } from '@rgrove/parse-xml';
import { attr, child, childText, children } from '../xml.js';
import { parseDate, parseDuration } from '../dates.js';
import { mediaKindFor } from '../kind.js';
import { sanitizeHtml, summarize } from '../sanitize.js';
import { absoluteUrl } from '../urls.js';
import type { Item, MediaAttachment, ParsedFeed } from '../types.js';

/**
 * Atom, which is the better specified of the two XML formats and still needs care in one place:
 * `link` is an element with a `rel`, not a text node, and picking the wrong one sends the reader
 * to the feed document instead of the post.
 */

export interface AtomParseOptions {
	feedUrl: string;
	maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 100;

/** The first link with this rel, or with no rel at all, which Atom defines as alternate. */
function linkWithRel(parent: XmlElement, rel: string, baseUrl: string): XmlElement | null {
	for (const link of children(parent, 'link')) {
		const value = attr(link, 'rel') ?? 'alternate';
		if (value.toLowerCase() === rel && absoluteUrl(attr(link, 'href'), baseUrl)) return link;
	}
	return null;
}

function mediaFrom(entry: XmlElement, baseUrl: string): MediaAttachment[] {
	const media: MediaAttachment[] = [];
	const seen = new Set<string>();

	for (const link of children(entry, 'link')) {
		if ((attr(link, 'rel') ?? '').toLowerCase() !== 'enclosure') continue;
		const url = absoluteUrl(attr(link, 'href'), baseUrl);
		if (!url || seen.has(url)) continue;
		const mimeType = attr(link, 'type');
		const kind = mediaKindFor(mimeType, url);
		if (!kind) continue;
		const length = Number(attr(link, 'length'));
		seen.add(url);
		media.push({
			url,
			kind,
			...(mimeType ? { mimeType } : {}),
			...(Number.isFinite(length) && length > 0 ? { sizeBytes: length } : {})
		});
	}

	// Media RSS inside Atom, which is how YouTube publishes.
	for (const group of [entry, ...children(entry, 'group')]) {
		for (const content of children(group, 'content')) {
			const url = absoluteUrl(attr(content, 'url'), baseUrl);
			if (!url || seen.has(url)) continue;
			const mimeType = attr(content, 'type') ?? attr(content, 'medium');
			const kind = mediaKindFor(mimeType, url);
			if (!kind) continue;
			const duration = parseDuration(attr(content, 'duration'));
			seen.add(url);
			media.push({
				url,
				kind,
				...(mimeType ? { mimeType } : {}),
				...(duration ? { durationSeconds: duration } : {})
			});
		}
		for (const thumbnail of children(group, 'thumbnail')) {
			const url = absoluteUrl(attr(thumbnail, 'url'), baseUrl);
			if (!url || seen.has(url)) continue;
			seen.add(url);
			media.push({ url, kind: 'image' });
		}
	}

	return media;
}

function itemFrom(entry: XmlElement, options: AtomParseOptions): Item | null {
	const { feedUrl } = options;
	const alternate = linkWithRel(entry, 'alternate', feedUrl);
	const url = absoluteUrl(attr(alternate ?? entry, 'href'), feedUrl);
	if (!url) return null;

	const contentElement = child(entry, 'content');
	const summaryElement = child(entry, 'summary');
	const rawContent = contentElement?.text.trim() ?? '';
	const rawSummary = summaryElement?.text.trim() ?? '';
	const authorElement = child(entry, 'author');
	const author = authorElement ? childText(authorElement, 'name') : '';

	return {
		id: childText(entry, 'id') || url,
		title: childText(entry, 'title') || 'Untitled',
		url,
		...(author ? { author } : {}),
		publishedAt: parseDate(childText(entry, 'published') || childText(entry, 'updated')),
		summary: summarize(rawSummary || rawContent),
		contentHtml: rawContent ? sanitizeHtml(rawContent, { baseUrl: url }) : null,
		media: mediaFrom(entry, url),
		sourceFeedId: feedUrl
	};
}

export function parseAtom(document: XmlDocument, options: AtomParseOptions): ParsedFeed {
	const root = document.root;
	if (!root) throw new Error('feed document has no root element');

	const { feedUrl, maxItems = DEFAULT_MAX_ITEMS } = options;
	const items: Item[] = [];
	for (const entry of children(root, 'entry').slice(0, maxItems)) {
		const item = itemFrom(entry, options);
		if (item) items.push(item);
	}

	const alternate = linkWithRel(root, 'alternate', feedUrl);

	return {
		id: feedUrl,
		title: childText(root, 'title') || 'Untitled feed',
		siteUrl: absoluteUrl(attr(alternate ?? root, 'href'), feedUrl),
		description: summarize(childText(root, 'subtitle'), 200),
		iconUrl:
			absoluteUrl(childText(root, 'icon'), feedUrl) ??
			absoluteUrl(childText(root, 'logo'), feedUrl),
		format: 'atom',
		kind: 'blog',
		items
	};
}
