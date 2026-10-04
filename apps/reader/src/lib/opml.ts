import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { safeUrl } from '@yipden/ring-client';
import { cleanFolder, folderList } from './folders.js';
import type { Feed, Person, ShelfItem } from './store/index.js';

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
	feeds: Array<{ url: string; title: string; kind: string; enabled?: boolean }>;
	/** The folder the file had them in, when it had one. */
	folder?: string;
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

/**
 * The attribute that marks the Shelf's group, so YipDen can find it again without guessing from
 * its title. Other readers ignore it, and ignore the link outlines inside for lack of an `xmlUrl`.
 */
const SHELF_GROUP = 'yipdenShelf';

/**
 * The Shelf as OPML's own kind of outline for a plain link (`type="link"` with a `url`), grouped
 * under one folder so a reader's feed list and their saved links travel in one file.
 */
function shelfOutline(shelf: ShelfItem[]): string {
	if (!shelf.length) return '';
	const links = shelf
		.map(
			(item) =>
				`\t\t\t<outline type="link" text="${escapeAttribute(item.title)}" ` +
				`title="${escapeAttribute(item.title)}" url="${escapeAttribute(item.url)}"` +
				`${item.creator ? ` yipdenCreator="${escapeAttribute(item.creator)}"` : ''}` +
				`${item.via ? ` yipdenVia="${escapeAttribute(item.via)}"` : ''}` +
				` yipdenFrom="${item.from}" yipdenSavedAt="${escapeAttribute(item.savedAt)}"/>`
		)
		.join('\n');
	return (
		`\t\t<outline text="YipDen Shelf" title="YipDen Shelf" ${SHELF_GROUP}="true">\n` +
		`${links}\n\t\t</outline>`
	);
}

/**
 * Marks a folder outline as YipDen's own, so a person with several feeds inside it is read back as
 * one person rather than guessed at. Other readers ignore it and see an ordinary nested folder.
 */
const FOLDER_GROUP = 'yipdenFolder';

function personOutline(person: Person, feeds: Feed[], indent: string): string {
	const inner = feeds
		.map(
			(feed) =>
				`${indent}\t<outline type="${opmlType(feed.kind)}" text="${escapeAttribute(feed.title)}" ` +
				`title="${escapeAttribute(feed.title)}" xmlUrl="${escapeAttribute(feed.url)}" ` +
				`htmlUrl="${escapeAttribute(person.siteUrl)}"${feed.enabled === false ? ' yipdenEnabled="false"' : ''}/>`
		)
		.join('\n');
	return (
		`${indent}<outline text="${escapeAttribute(person.name)}" title="${escapeAttribute(person.name)}">\n` +
		`${inner}\n${indent}</outline>`
	);
}

export function exportOpml(
	people: Person[],
	feedsByPerson: Map<string, Feed[]>,
	shelf: ShelfItem[] = []
): string {
	const outlineFor = (person: Person, indent: string) =>
		personOutline(person, feedsByPerson.get(person.id) ?? [], indent);

	const folders = folderList(people).map((folder) => {
		const members = people
			.filter((person) => person.folder === folder.name)
			.map((person) => outlineFor(person, '\t\t\t'))
			.join('\n');
		const name = escapeAttribute(folder.name);
		return (
			`\t\t<outline text="${name}" title="${name}" ${FOLDER_GROUP}="true">\n` +
			`${members}\n\t\t</outline>`
		);
	});
	const unfiled = people
		.filter((person) => !person.folder)
		.map((person) => outlineFor(person, '\t\t'));
	const outlines = [...folders, ...unfiled].join('\n');
	const body = [outlines, shelfOutline(shelf)].filter(Boolean).join('\n');

	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<opml version="2.0">\n' +
		'\t<head>\n' +
		'\t\t<title>YipDen follows</title>\n' +
		`\t\t<dateCreated>${new Date().toUTCString()}</dateCreated>\n` +
		'\t</head>\n' +
		'\t<body>\n' +
		body +
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
		return {
			url,
			title,
			kind,
			...(outline.attributes.yipdenEnabled === 'false' ? { enabled: false } : {})
		};
	};

	const nameOf = (outline: XmlElement) => outline.attributes.title || outline.attributes.text;

	/** Whose site a feed outline says it belongs to, falling back to where the feed itself is. */
	const siteHost = (outline: XmlElement): string | null => {
		const url = safeUrl(outline.attributes.htmlUrl) ?? safeUrl(outline.attributes.xmlUrl);
		return url ? url.hostname.replace(/^www\./, '') : null;
	};

	/**
	 * Another reader's folder, as opposed to one person's group of feeds: both are an outline
	 * around feed outlines, and only YipDen marks which it wrote. A group holding other groups, or
	 * feeds from more than one site, is a folder of people.
	 */
	const looksLikeFolder = (outline: XmlElement, nested: XmlElement[]): boolean => {
		if (outline.attributes.htmlUrl) return false;
		if (nested.some((child) => !child.attributes.xmlUrl && outlineChildren(child).length)) {
			return true;
		}
		const hosts = new Set(
			nested
				.filter((child) => child.attributes.xmlUrl)
				.map(siteHost)
				.filter(Boolean)
		);
		return hosts.size > 1;
	};

	const read = (outline: XmlElement, folder: string | undefined): void => {
		// The Shelf is not a person; `parseOpmlShelf` reads it.
		if (outline.attributes[SHELF_GROUP] === 'true') return;
		const nested = outlineChildren(outline);
		const inFolder = folder ? { folder } : {};

		if (outline.attributes.xmlUrl && !nested.length) {
			// A bare feed with no grouping outline around it: one person, one feed.
			const feed = feedFrom(outline);
			if (!feed) return;
			people.push({
				name: nameOf(outline) || new URL(feed.url).hostname,
				siteUrl: safeUrl(outline.attributes.htmlUrl)?.toString() ?? null,
				feeds: [feed],
				...inFolder
			});
			return;
		}

		if (outline.attributes[FOLDER_GROUP] === 'true' || looksLikeFolder(outline, nested)) {
			// One folder per person: the outermost one names it.
			const name = folder ?? cleanFolder(nameOf(outline));
			for (const child of nested) read(child, name);
			return;
		}

		const feeds = nested
			.map(feedFrom)
			.filter((feed): feed is NonNullable<typeof feed> => feed !== null);
		if (!feeds.length) return;

		const siteUrl =
			safeUrl(outline.attributes.htmlUrl)?.toString() ??
			safeUrl(nested.find((child) => child.attributes.htmlUrl)?.attributes.htmlUrl)?.toString() ??
			null;

		people.push({
			name: nameOf(outline) || new URL(feeds[0]!.url).hostname,
			siteUrl,
			feeds,
			...inFolder
		});
	};

	for (const outline of topLevel) read(outline, undefined);

	return people;
}

export interface ImportedShelfItem {
	url: string;
	title: string;
	creator?: string;
	via?: string;
	from: ShelfItem['from'];
	savedAt?: string;
}

/**
 * Read the Shelf out of an OPML file, when it has one. Same rule as everywhere: every URL goes
 * through `safeUrl`, and an unusable one is dropped rather than failing the import.
 */
export function parseOpmlShelf(xml: string): ImportedShelfItem[] {
	const document = parseXml(xml.trim(), { ignoreUndefinedEntities: true });
	const body = document.root?.children.find(
		(child): child is XmlElement =>
			child instanceof XmlElement && child.name.toLowerCase() === 'body'
	);
	if (!body) return [];

	const items: ImportedShelfItem[] = [];
	for (const group of outlineChildren(body)) {
		if (group.attributes[SHELF_GROUP] !== 'true') continue;
		for (const outline of outlineChildren(group)) {
			const url = safeUrl(outline.attributes.url)?.toString();
			if (!url) continue;
			const item: ImportedShelfItem = {
				url,
				title: outline.attributes.title || outline.attributes.text || new URL(url).hostname,
				from: outline.attributes.yipdenFrom === 'discover' ? 'discover' : 'feeds'
			};
			if (outline.attributes.yipdenCreator) item.creator = outline.attributes.yipdenCreator;
			if (outline.attributes.yipdenVia) item.via = outline.attributes.yipdenVia;
			if (outline.attributes.yipdenSavedAt) item.savedAt = outline.attributes.yipdenSavedAt;
			items.push(item);
		}
	}
	return items;
}
