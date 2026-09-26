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

interface ParsedMedia {
	media: MediaAttachment[];
	sensitive: boolean;
}

function sensitiveRating(value: string | undefined): boolean {
	return ['adult', 'explicit', 'true', 'yes'].includes(value?.trim().toLowerCase() ?? '');
}

function mediaFrom(item: XmlElement, baseUrl: string): ParsedMedia {
	const media: MediaAttachment[] = [];
	let sensitive = false;

	const add = (
		rawUrl: string | undefined,
		mimeType: string | undefined,
		extra: Partial<MediaAttachment> = {}
	) => {
		const url = absoluteUrl(rawUrl, baseUrl);
		if (!url) return;
		const existing = media.find((entry) => entry.url === url);
		if (existing) {
			if (!existing.mimeType && mimeType) existing.mimeType = mimeType;
			for (const [key, value] of Object.entries(extra)) {
				if (value !== undefined && existing[key as keyof MediaAttachment] === undefined) {
					Object.assign(existing, { [key]: value });
				}
			}
			return;
		}
		const kind = mediaKindFor(mimeType, url);
		if (!kind) return;
		media.push({ url, kind, ...(mimeType ? { mimeType } : {}), ...extra });
	};

	for (const enclosure of children(item, 'enclosure')) {
		const length = Number(attr(enclosure, 'length'));
		add(attr(enclosure, 'url'), attr(enclosure, 'type'), {
			...(Number.isFinite(length) && length > 0 ? { sizeBytes: length } : {})
		});
	}

	// Media RSS, which Mastodon, YouTube and PeerTube emit.
	for (const group of [item, ...children(item, 'group')]) {
		const groupDescription = group === item ? '' : childText(group, 'description');
		const groupTitle = group === item ? '' : childText(group, 'title');
		const groupSensitive = sensitiveRating(childText(group, 'rating'));
		if (groupSensitive) sensitive = true;

		for (const content of children(group, 'content')) {
			const duration = parseDuration(attr(content, 'duration'));
			const size = Number(attr(content, 'filesize') ?? attr(content, 'length'));
			const contentSensitive = groupSensitive || sensitiveRating(childText(content, 'rating'));
			if (contentSensitive) sensitive = true;
			const alt = childText(content, 'description') || groupDescription;
			const title = childText(content, 'title') || groupTitle;
			add(attr(content, 'url'), attr(content, 'type') ?? attr(content, 'medium'), {
				...(duration ? { durationSeconds: duration } : {}),
				...(Number.isFinite(size) && size > 0 ? { sizeBytes: size } : {}),
				...(title ? { title } : {}),
				...(alt ? { alt: summarize(alt, 1000) } : {}),
				...(contentSensitive ? { sensitive: true } : {})
			});

			for (const thumbnail of children(content, 'thumbnail')) {
				add(attr(thumbnail, 'url'), 'image/*', {
					...(alt ? { alt: summarize(alt, 1000) } : {}),
					...(contentSensitive ? { sensitive: true } : {})
				});
			}
		}
		for (const thumbnail of children(group, 'thumbnail')) {
			add(attr(thumbnail, 'url'), 'image/*', {
				...(groupDescription ? { alt: summarize(groupDescription, 1000) } : {}),
				...(groupSensitive ? { sensitive: true } : {})
			});
		}
	}

	const duration = parseDuration(childText(item, 'duration'));
	if (duration) {
		const audio = media.find((entry) => entry.kind === 'audio');
		if (audio && !audio.durationSeconds) audio.durationSeconds = duration;
	}

	return { media, sensitive };
}

function relatedUrls(element: XmlElement, relation: string, baseUrl: string): string[] {
	const urls: string[] = [];
	for (const link of children(element, 'link')) {
		if ((attr(link, 'rel') ?? '').toLowerCase() !== relation) continue;
		const url = absoluteUrl(attr(link, 'href'), baseUrl);
		if (url && !urls.includes(url)) urls.push(url);
	}
	if (relation === 'syndication') {
		for (const syndication of children(element, 'syndication')) {
			const url = absoluteUrl(attr(syndication, 'href') ?? syndication.text.trim(), baseUrl);
			if (url && !urls.includes(url)) urls.push(url);
		}
	}
	return urls;
}

const MASTODON_WARNING = /^\s*<p[^>]*>\s*<strong[^>]*>.*?<\/strong>\s*(.*?)<\/p>\s*<hr\s*\/?\s*>/is;

/** Mastodon places a localized content-warning label and warning text before an hr. */
function mastodonContentWarning(html: string): string {
	const match = html.match(MASTODON_WARNING);
	return match?.[1] ? summarize(match[1], 500) : '';
}

function itemFrom(element: XmlElement, options: RssParseOptions, isMastodon: boolean): Item | null {
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
	const contentWarning = isMastodon ? mastodonContentWarning(contentHtml) : '';
	const bodyHtml = contentWarning ? contentHtml.replace(MASTODON_WARNING, '') : contentHtml;
	const summarySource = bodyHtml || childText(element, 'description');
	const parsedMedia = mediaFrom(element, link);
	const canonicalUrl = relatedUrls(element, 'canonical', link)[0];
	const syndicationUrls = relatedUrls(element, 'syndication', link);
	const inReplyTo = child(element, 'in-reply-to');
	const replyToUrl = inReplyTo
		? absoluteUrl(attr(inReplyTo, 'href') ?? attr(inReplyTo, 'ref'), link)
		: null;

	return {
		id: guid || link,
		title: childText(element, 'title') || 'Untitled',
		url: link,
		...(canonicalUrl ? { canonicalUrl } : {}),
		...(syndicationUrls.length ? { syndicationUrls } : {}),
		...(childText(element, 'creator') || childText(element, 'author')
			? { author: childText(element, 'creator') || childText(element, 'author') }
			: {}),
		publishedAt: parseDate(childText(element, 'pubdate') || childText(element, 'date')),
		summary: summarize(summarySource),
		contentHtml: bodyHtml ? sanitizeHtml(bodyHtml, { baseUrl: link }) : null,
		...(contentWarning ? { contentWarning } : {}),
		...(parsedMedia.sensitive || contentWarning ? { sensitive: true } : {}),
		...(replyToUrl ? { replyToUrl } : {}),
		media: parsedMedia.media,
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
	const isMastodon = /^Mastodon\b/i.test(childText(channel, 'generator'));
	const items: Item[] = [];
	for (const element of itemElements.slice(0, maxItems)) {
		const item = itemFrom(element, options, isMastodon);
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
