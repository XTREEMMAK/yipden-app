import { parseDate, parseDuration } from '../dates.js';
import { mediaKindFor } from '../kind.js';
import { sanitizeHtml, summarize } from '../sanitize.js';
import { absoluteUrl } from '../urls.js';
import type { Item, MediaAttachment, ParsedFeed } from '../types.js';

/**
 * JSON Feed, which is the easiest of the three to read and the easiest to be careless with.
 *
 * Every field here arrives as `unknown` and is checked before use. A JSON feed is a document
 * from a stranger, not an object with a type, and treating it as typed because it parsed is how
 * a malformed feed becomes a crash on someone's phone.
 */

export interface JsonFeedParseOptions {
	feedUrl: string;
	maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 100;

function text(value: unknown, maxLength = 1000): string {
	return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function authorOf(record: Record<string, unknown>): string {
	const authors = Array.isArray(record.authors) ? record.authors : [];
	const first = authors[0];
	if (first && typeof first === 'object') {
		const name = text((first as Record<string, unknown>).name, 100);
		if (name) return name;
	}
	const single = record.author;
	if (single && typeof single === 'object') {
		return text((single as Record<string, unknown>).name, 100);
	}
	return text(single, 100);
}

function attachmentsOf(value: unknown, baseUrl: string): MediaAttachment[] {
	if (!Array.isArray(value)) return [];
	const media: MediaAttachment[] = [];
	const seen = new Set<string>();

	for (const raw of value.slice(0, 20)) {
		if (!raw || typeof raw !== 'object') continue;
		const record = raw as Record<string, unknown>;
		const url = absoluteUrl(record.url, baseUrl);
		if (!url || seen.has(url)) continue;

		const mimeType = text(record.mime_type, 100);
		const kind = mediaKindFor(mimeType || undefined, url);
		if (!kind) continue;

		const size = Number(record.size_in_bytes);
		const duration = parseDuration(record.duration_in_seconds);
		const title = text(record.title, 200);
		seen.add(url);
		media.push({
			url,
			kind,
			...(mimeType ? { mimeType } : {}),
			...(Number.isFinite(size) && size > 0 ? { sizeBytes: size } : {}),
			...(duration ? { durationSeconds: duration } : {}),
			...(title ? { title } : {})
		});
	}

	return media;
}

function itemFrom(raw: unknown, options: JsonFeedParseOptions): Item | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	const { feedUrl } = options;

	const url = absoluteUrl(record.url, feedUrl) ?? absoluteUrl(record.external_url, feedUrl);
	if (!url) return null;

	const contentHtml = text(record.content_html, 200_000);
	const contentText = text(record.content_text, 20_000);
	const summarySource = text(record.summary, 2000) || contentHtml || contentText;
	const author = authorOf(record);
	const image = absoluteUrl(record.image, url);
	const media = attachmentsOf(record.attachments, url);
	if (image && !media.some((entry) => entry.url === image)) {
		media.unshift({ url: image, kind: 'image' });
	}

	return {
		id: text(record.id, 500) || url,
		title: text(record.title, 500) || 'Untitled',
		url,
		...(author ? { author } : {}),
		publishedAt: parseDate(record.date_published ?? record.date_modified),
		summary: summarize(summarySource),
		contentHtml: contentHtml ? sanitizeHtml(contentHtml, { baseUrl: url }) : null,
		media,
		sourceFeedId: feedUrl
	};
}

export function parseJsonFeed(json: unknown, options: JsonFeedParseOptions): ParsedFeed {
	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		throw new Error('JSON feed is not an object');
	}

	const record = json as Record<string, unknown>;
	if (!Array.isArray(record.items)) throw new Error('JSON feed has no items array');

	const { feedUrl, maxItems = DEFAULT_MAX_ITEMS } = options;
	const items: Item[] = [];
	for (const raw of record.items.slice(0, maxItems)) {
		const item = itemFrom(raw, options);
		if (item) items.push(item);
	}

	return {
		id: feedUrl,
		title: text(record.title, 200) || 'Untitled feed',
		siteUrl: absoluteUrl(record.home_page_url, feedUrl),
		description: summarize(text(record.description, 2000), 200),
		iconUrl: absoluteUrl(record.icon, feedUrl) ?? absoluteUrl(record.favicon, feedUrl),
		format: 'jsonfeed',
		kind: 'blog',
		items
	};
}
