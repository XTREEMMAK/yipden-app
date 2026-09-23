import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { safeUrl } from '@yipden/ring-client';
import type { Feed, Person } from './store/index.js';

/**
 * A reader's follow list as OPML, in and out.
 *
 * OPML is the one format every feed reader agrees on. Exporting means a reader can leave for
 * another app with everything they built here; importing means they can arrive with everything
 * they built somewhere else. Neither depends on the ring or on re-running discovery: an OPML
 * file already names the feeds directly.
 */

export interface ImportedPerson {
	name: string;
	siteUrl: string | null;
	feeds: Array<{ url: string; title: string; kind: string }>;
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** OPML's own `type` values, closest match to this app's feed kinds. */
function opmlType(kind: string): string {
	return kind === 'jsonfeed' ? 'json' : kind === 'atom' ? 'atom' : 'rss';
}

export function exportOpml(people: Person[], feedsByPerson: Map<string, Feed[]>): string {
	const outlines = people
		.map((person) => {
			const feeds = feedsByPerson.get(person.id) ?? [];
			const inner = feeds
				.map(
					(feed) =>
						`\t\t\t<outline type="${opmlType(feed.kind)}" text="${escapeAttribute(feed.title)}" ` +
						`title="${escapeAttribute(feed.title)}" xmlUrl="${escapeAttribute(feed.url)}" ` +
						`htmlUrl="${escapeAttribute(person.siteUrl)}"/>`
				)
				.join('\n');
			return (
				`\t\t<outline text="${escapeAttribute(person.name)}" title="${escapeAttribute(person.name)}">\n` +
				`${inner}\n\t\t</outline>`
			);
		})
		.join('\n');

	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<opml version="2.0">\n' +
		'\t<head>\n' +
		'\t\t<title>YipDen follows</title>\n' +
		`\t\t<dateCreated>${new Date().toUTCString()}</dateCreated>\n` +
		'\t</head>\n' +
		'\t<body>\n' +
		outlines +
		'\n\t</body>\n' +
		'</opml>\n'
	);
}

function outlineChildren(element: XmlElement): XmlElement[] {
	return element.children.filter(
		(child): child is XmlElement =>
			child instanceof XmlElement && child.name.toLowerCase() === 'outline'
	);
}

/**
 * Read an OPML file into people and their feeds, ready to follow.
 *
 * Every URL goes through the same `safeUrl` check as anywhere else in the app: an OPML file is
 * exported by another reader, but there is no reason to trust its contents any more than a
 * feed's. A feed outline with no name falls back to its host, and one with an unusable URL is
 * dropped rather than failing the whole import.
 */
export function parseOpml(xml: string): ImportedPerson[] {
	const document = parseXml(xml.trim(), { ignoreUndefinedEntities: true });
	const body = document.root
		? outlineChildren(document.root).length
			? document.root
			: document.root.children.find(
					(child): child is XmlElement =>
						child instanceof XmlElement && child.name.toLowerCase() === 'body'
				)
		: null;
	if (!body) return [];

	const topLevel = outlineChildren(body);
	const people: ImportedPerson[] = [];

	const feedFrom = (outline: XmlElement) => {
		const url = safeUrl(outline.attributes.xmlUrl)?.toString();
		if (!url) return null;
		const title = outline.attributes.title || outline.attributes.text || new URL(url).hostname;
		const kind = (outline.attributes.type || '').toLowerCase() || 'blog';
		return { url, title, kind };
	};

	for (const outline of topLevel) {
		const nested = outlineChildren(outline);

		if (outline.attributes.xmlUrl && !nested.length) {
			// A bare feed with no grouping outline around it: one person, one feed.
			const feed = feedFrom(outline);
			if (!feed) continue;
			people.push({
				name: outline.attributes.title || outline.attributes.text || new URL(feed.url).hostname,
				siteUrl: safeUrl(outline.attributes.htmlUrl)?.toString() ?? null,
				feeds: [feed]
			});
			continue;
		}

		const feeds = nested
			.map(feedFrom)
			.filter((feed): feed is NonNullable<typeof feed> => feed !== null);
		if (!feeds.length) continue;

		const siteUrl =
			safeUrl(outline.attributes.htmlUrl)?.toString() ??
			safeUrl(nested.find((child) => child.attributes.htmlUrl)?.attributes.htmlUrl)?.toString() ??
			null;

		people.push({
			name: outline.attributes.title || outline.attributes.text || new URL(feeds[0]!.url).hostname,
			siteUrl,
			feeds
		});
	}

	return people;
}
