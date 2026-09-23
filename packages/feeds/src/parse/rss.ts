import type { XmlDocument, XmlElement } from '@rgrove/parse-xml';
import {
	attr,
	child,
	childElements,
	childText,
	children,
	firstDescendant,
	localName
} from '../xml.js';
import { parseDate, parseDuration } from '../dates.js';
import { mediaKindFor } from '../kind.js';
import { sanitizeHtml, summarize } from '../sanitize.js';
import { absoluteUrl } from '../urls.js';
import type { Item, MediaAttachment, ParsedFeed } from '../types.js';

/**
 * RSS 2.0, and RSS 1.0 (RDF) alongside it.
 *
 * The two are different specifications with the same element names in different places: RDF
 * puts `item` beside `channel` rather than inside it. Handling both costs one branch and means
 * the reader does not refuse a feed for being from 2003.
 */

export interface RssParseOptions {
	/** The feed's own address, for resolving relative links and identifying items. */
	feedUrl: string;
	maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 100;

function mediaFrom(item: XmlElement, baseUrl: string): MediaAttachment[] {
	const media: MediaAttachment[] = [];
	const seen = new Set<string>();

	const add = (
		rawUrl: string | undefined,
		mimeType: string | undefined,
		extra: Partial<MediaAttachment> = {}
	) => {
		const url = absoluteUrl(rawUrl, baseUrl);
		if (!url || seen.has(url)) return;
		const kind = mediaKindFor(mimeType, url);
		if (!kind) return;
		seen.add(url);
		media.push({ url, kind, ...(mimeType ? { mimeType } : {}), ...extra });
	};

	for (const enclosure of children(item, 'enclosure')) {
		const length = Number(attr(enclosure, 'length'));
		add(attr(enclosure, 'url'), attr(enclosure, 'type'), {
			...(Number.isFinite(length) && length > 0 ? { sizeBytes: length } : {})
		});
	}

	// Media RSS, which YouTube and PeerTube both emit.
	for (const group of [item, ...children(item, 'group')]) {
		for (const content of children(group, 'content')) {
			const duration = parseDuration(attr(content, 'duration'));
			add(attr(content, 'url'), attr(content, 'type') ?? attr(content, 'medium'), {
				...(duration ? { durationSeconds: duration } : {})
			});
		}
		for (const thumbnail of children(group, 'thumbnail')) {
			add(attr(thumbnail, 'url'), 'image/*');
		}
	}

	const duration = parseDuration(childText(item, 'duration'));
	if (duration) {
		const audio = media.find((entry) => entry.kind === 'audio');
		if (audio && !audio.durationSeconds) audio.durationSeconds = duration;
	}

	return media;
}

function itemFrom(element: XmlElement, options: RssParseOptions): Item | null {
	const { feedUrl } = options;

	const guidElement = child(element, 'guid');
	const guid = guidElement?.text.trim() ?? '';
	const isPermaLink = attr(guidElement ?? element, 'ispermalink') !== 'false';

	const link =
		absoluteUrl(childText(element, 'link'), feedUrl) ??
		absoluteUrl(childText(element, 'origlink'), feedUrl) ??
		(guid && isPermaLink ? absoluteUrl(guid, feedUrl) : null);

	// A yip with nowhere to go is not a yip. Every one of these links out to its creator.
	if (!link) return null;

	const contentHtml = childText(element, 'encoded') || childText(element, 'description');
	const summarySource = childText(element, 'description') || contentHtml;

	return {
		id: guid || link,
		title: childText(element, 'title') || 'Untitled',
		url: link,
		...(childText(element, 'creator') || childText(element, 'author')
			? { author: childText(element, 'creator') || childText(element, 'author') }
			: {}),
		publishedAt: parseDate(childText(element, 'pubdate') || childText(element, 'date')),
		summary: summarize(summarySource),
		contentHtml: contentHtml ? sanitizeHtml(contentHtml, { baseUrl: link }) : null,
		media: mediaFrom(element, link),
		sourceFeedId: feedUrl
	};
}

export function parseRss(document: XmlDocument, options: RssParseOptions): ParsedFeed {
	const root = document.root;
	if (!root) throw new Error('feed document has no root element');

	const isRdf = localName(root) === 'rdf';
	const channel = isRdf ? firstDescendant(root, 'channel') : child(root, 'channel');
	if (!channel) throw new Error('RSS document has no channel');

	const itemElements = isRdf
		? childElements(root).filter((element) => localName(element) === 'item')
		: children(channel, 'item');

	const { feedUrl, maxItems = DEFAULT_MAX_ITEMS } = options;
	const items: Item[] = [];
	for (const element of itemElements.slice(0, maxItems)) {
		const item = itemFrom(element, options);
		if (item) items.push(item);
	}

	const image = child(channel, 'image');
	const iconUrl =
		absoluteUrl(image ? childText(image, 'url') : undefined, feedUrl) ??
		absoluteUrl(attr(child(channel, 'image') ?? channel, 'href'), feedUrl);

	return {
		id: feedUrl,
		title: childText(channel, 'title') || 'Untitled feed',
		siteUrl: absoluteUrl(childText(channel, 'link'), feedUrl),
		description: summarize(childText(channel, 'description'), 200),
		iconUrl,
		format: 'rss',
		kind: 'blog',
		items
	};
}
