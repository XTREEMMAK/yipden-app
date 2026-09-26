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

interface ParsedMedia {
	media: MediaAttachment[];
	sensitive: boolean;
}

function sensitiveRating(value: string | undefined): boolean {
	return ['adult', 'explicit', 'true', 'yes'].includes(value?.trim().toLowerCase() ?? '');
}

/** The first link with this rel, or with no rel at all, which Atom defines as alternate. */
function linkWithRel(parent: XmlElement, rel: string, baseUrl: string): XmlElement | null {
	for (const link of children(parent, 'link')) {
		const value = attr(link, 'rel') ?? 'alternate';
		if (value.toLowerCase() === rel && absoluteUrl(attr(link, 'href'), baseUrl)) return link;
	}
	return null;
}

function mediaFrom(entry: XmlElement, baseUrl: string): ParsedMedia {
	const media: MediaAttachment[] = [];
	let sensitive = false;

	const add = (
		rawUrl: string | undefined,
		mimeType: string | undefined,
		extra: Partial<MediaAttachment> = {}
	) => {
		const url = absoluteUrl(rawUrl, baseUrl);
		if (!url) return;
		const existing = media.find((item) => item.url === url);
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

	for (const link of children(entry, 'link')) {
		if ((attr(link, 'rel') ?? '').toLowerCase() !== 'enclosure') continue;
		const mimeType = attr(link, 'type');
		const length = Number(attr(link, 'length'));
		add(attr(link, 'href'), mimeType, {
			...(Number.isFinite(length) && length > 0 ? { sizeBytes: length } : {})
		});
	}

	// Media RSS inside Atom, which is how YouTube publishes.
	for (const group of [entry, ...children(entry, 'group')]) {
		const groupDescription = group === entry ? '' : childText(group, 'description');
		const groupTitle = group === entry ? '' : childText(group, 'title');
		const groupSensitive = sensitiveRating(childText(group, 'rating'));
		if (groupSensitive) sensitive = true;

		for (const content of children(group, 'content')) {
			const mimeType = attr(content, 'type') ?? attr(content, 'medium');
			const duration = parseDuration(attr(content, 'duration'));
			const size = Number(attr(content, 'filesize') ?? attr(content, 'length'));
			const contentSensitive = groupSensitive || sensitiveRating(childText(content, 'rating'));
			if (contentSensitive) sensitive = true;
			const alt = childText(content, 'description') || groupDescription;
			const title = childText(content, 'title') || groupTitle;
			add(attr(content, 'url'), mimeType, {
				...(duration ? { durationSeconds: duration } : {}),
				...(Number.isFinite(size) && size > 0 ? { sizeBytes: size } : {}),
				...(title ? { title } : {}),
				...(alt ? { alt: summarize(alt, 1000) } : {}),
				...(contentSensitive ? { sensitive: true } : {})
			});
		}
		for (const thumbnail of children(group, 'thumbnail')) {
			add(attr(thumbnail, 'url'), 'image/*', {
				...(groupDescription ? { alt: summarize(groupDescription, 1000) } : {}),
				...(groupSensitive ? { sensitive: true } : {})
			});
		}
	}

	return { media, sensitive };
}

function relatedUrls(entry: XmlElement, relation: string, baseUrl: string): string[] {
	const urls: string[] = [];
	for (const link of children(entry, 'link')) {
		if ((attr(link, 'rel') ?? 'alternate').toLowerCase() !== relation) continue;
		const url = absoluteUrl(attr(link, 'href'), baseUrl);
		if (url && !urls.includes(url)) urls.push(url);
	}
	return urls;
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
	const canonicalUrl = relatedUrls(entry, 'canonical', url)[0];
	const syndicationUrls = relatedUrls(entry, 'syndication', url);
	const inReplyTo = child(entry, 'in-reply-to');
	const replyToUrl = inReplyTo
		? absoluteUrl(attr(inReplyTo, 'href') ?? attr(inReplyTo, 'ref'), url)
		: null;
	const parsedMedia = mediaFrom(entry, url);

	return {
		id: childText(entry, 'id') || url,
		title: childText(entry, 'title') || 'Untitled',
		url,
		...(canonicalUrl ? { canonicalUrl } : {}),
		...(syndicationUrls.length ? { syndicationUrls } : {}),
		...(author ? { author } : {}),
		publishedAt: parseDate(childText(entry, 'published') || childText(entry, 'updated')),
		summary: summarize(rawSummary || rawContent),
		contentHtml: rawContent ? sanitizeHtml(rawContent, { baseUrl: url }) : null,
		...(parsedMedia.sensitive ? { sensitive: true } : {}),
		...(replyToUrl ? { replyToUrl } : {}),
		media: parsedMedia.media,
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
