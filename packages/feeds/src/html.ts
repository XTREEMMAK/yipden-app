import type { SiteLayout } from '@yipden/ring-client';
import { decodeEntities, tokenize } from './tokenize.js';
import { absoluteUrl } from './urls.js';

/**
 * Reading a person's home page well enough to find their feeds.
 *
 * This is not a DOM and does not try to be one. Discovery needs four things out of a page: its
 * `link rel=alternate` tags, its `rel=me` links, its title, and its h-card if it has one. All
 * four are answerable from a flat token walk, and a flat token walk cannot be tricked into
 * executing anything.
 */

export interface PageLink {
	rel: string;
	type: string;
	href: string;
	title: string;
}

export interface ScannedPage {
	title: string | null;
	/** `link rel=alternate` tags, the first and best place a feed announces itself. */
	alternates: PageLink[];
	/** `rel=me` links from anywhere on the page, which is where profiles are declared. */
	relMe: string[];
	/** Every other outbound link, used only to find profiles an h-card did not mark up. */
	links: string[];
	iconUrl: string | null;
	/** The name from an h-card, when the page has one. */
	cardName: string | null;
	/** The h-card's own note (`p-note`): a person's bio in their own words. Plain text. */
	cardNote: string | null;
	/** The page's `meta name=description`, or its `og:description`. */
	description: string | null;
	/** A picture of them: the h-card's `u-photo`, else the page's `og:image`. */
	photoUrl: string | null;
	/** The document had an html, head or body tag: it was a page, not a feed or a fragment. */
	isHtml: boolean;
	/** The page carries a `meta name=viewport`, which is what a page built for phones declares. */
	hasViewport: boolean;
}

const MAX_LINKS = 500;
/** A bio, not an essay: longer text is cut at a word near this. */
const MAX_BIO = 600;
const MAX_JSON_LD_BYTES = 256 * 1024;

function relTokens(value: string | undefined): string[] {
	return (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Schema.org's `sameAs` is a common way for a client-rendered site to publish its social
 * identities without putting those links in server-rendered anchors. Treat it as a one-way
 * identity declaration, like rel=me on this page. It is not two-way verification by itself.
 */
function sameAsUrls(source: string, baseUrl: string): string[] {
	if (!source.trim() || source.length > MAX_JSON_LD_BYTES) return [];
	try {
		const document: unknown = JSON.parse(source);
		const found: string[] = [];
		const visit = (value: unknown) => {
			if (!value || found.length >= 50) return;
			if (Array.isArray(value)) {
				for (const item of value) visit(item);
				return;
			}
			if (typeof value !== 'object') return;
			for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
				if (key === 'sameAs') {
					for (const candidate of Array.isArray(child) ? child : [child]) {
						const url = absoluteUrl(candidate, baseUrl);
						if (url && !found.includes(url)) found.push(url);
					}
				} else {
					visit(child);
				}
			}
		};
		visit(document);
		return found;
	} catch {
		return [];
	}
}

/**
 * Walk a page once and collect everything discovery might want from it.
 *
 * One pass rather than four, because this runs on a phone against a page that may be several
 * hundred kilobytes, and because the caps then apply to the whole walk rather than per query.
 */
export function scanPage(html: string, baseUrl: string): ScannedPage {
	const alternates: PageLink[] = [];
	const relMe: string[] = [];
	const links: string[] = [];
	let title: string | null = null;
	let iconUrl: string | null = null;
	let cardName: string | null = null;
	let description: string | null = null;
	let ogDescription: string | null = null;
	let cardPhoto: string | null = null;
	let ogImage: string | null = null;
	let note = '';
	let noteTag: string | null = null;
	let noteDepth = 0;
	let noteDone = false;
	let isHtml = false;
	let hasViewport = false;

	let inTitle = false;
	let pendingCardName = false;
	let anchorText = '';
	let inAnchor = false;
	let inJsonLd = false;
	let jsonLd = '';

	for (const token of tokenize(html)) {
		if (token.type === 'text') {
			if (inJsonLd && jsonLd.length <= MAX_JSON_LD_BYTES) jsonLd += token.value;
			if (inTitle && !title) title = token.value.trim() || null;
			if (pendingCardName && !cardName) cardName = token.value.trim() || null;
			if (inAnchor) anchorText += token.value;
			if (noteDepth > 0 && note.length < MAX_BIO * 2) note += token.value;
			continue;
		}

		if (token.type === 'end') {
			// Paragraphs and line breaks in a note stay apart as words.
			if (noteDepth > 0) note += ' ';
			if (noteDepth > 0 && token.name === noteTag) {
				noteDepth -= 1;
				if (noteDepth === 0) noteDone = true;
			}
			if (token.name === 'title') inTitle = false;
			if (token.name === 'a') inAnchor = false;
			if (token.name === 'script' && inJsonLd) {
				for (const href of sameAsUrls(jsonLd, baseUrl)) {
					if (!relMe.includes(href)) relMe.push(href);
				}
				inJsonLd = false;
				jsonLd = '';
			}
			pendingCardName = false;
			continue;
		}

		const { name, attributes } = token;

		if (name === 'html' || name === 'head' || name === 'body') isHtml = true;
		if (name === 'meta' && (attributes.name ?? '').toLowerCase() === 'viewport') {
			hasViewport = true;
		}

		if (name === 'script' && (attributes.type ?? '').toLowerCase() === 'application/ld+json') {
			inJsonLd = true;
			jsonLd = '';
			continue;
		}

		if (name === 'title' && !title) {
			inTitle = true;
			continue;
		}

		const classes = relTokens(attributes.class);
		if (!cardName && (classes.includes('p-name') || classes.includes('fn'))) {
			pendingCardName = true;
		}
		if (noteDepth > 0 && name === noteTag && !token.selfClosing) noteDepth += 1;
		else if (!noteDone && noteDepth === 0 && classes.includes('p-note') && !token.selfClosing) {
			noteTag = name;
			noteDepth = 1;
		}
		if (!cardPhoto && classes.includes('u-photo')) {
			cardPhoto = absoluteUrl(attributes.src ?? attributes.href, baseUrl);
		}

		if (name === 'link') {
			const rel = relTokens(attributes.rel);
			const href = absoluteUrl(attributes.href, baseUrl);
			if (!href) continue;

			if (rel.includes('alternate') && alternates.length < 50) {
				alternates.push({
					rel: rel.join(' '),
					type: (attributes.type ?? '').toLowerCase(),
					href,
					title: attributes.title ?? ''
				});
			}
			if (rel.includes('me') && !relMe.includes(href)) relMe.push(href);
			if (!iconUrl && rel.some((value) => value === 'icon' || value === 'apple-touch-icon')) {
				iconUrl = href;
			}
			continue;
		}

		if (name === 'a') {
			inAnchor = true;
			anchorText = '';
			const rel = relTokens(attributes.rel);
			const href = absoluteUrl(attributes.href, baseUrl);
			if (!href) continue;

			// An h-card marks its own URL with u-url; treat it like rel=me, which is what it means.
			if ((rel.includes('me') || classes.includes('u-url')) && !relMe.includes(href)) {
				relMe.push(href);
			}
			// Some sites announce a feed with an anchor rather than a link tag.
			if (rel.includes('alternate') && alternates.length < 50) {
				alternates.push({
					rel: rel.join(' '),
					type: (attributes.type ?? '').toLowerCase(),
					href,
					title: attributes.title ?? anchorText.trim()
				});
			}
			if (links.length < MAX_LINKS && !links.includes(href)) links.push(href);
			continue;
		}

		if (name === 'meta') {
			const property = (attributes.property ?? attributes.name ?? '').toLowerCase();
			const content = attributes.content?.trim() || null;
			if (!title && (property === 'og:site_name' || property === 'og:title')) title = content;
			if (property === 'description' && !description) description = content;
			if (property === 'og:description' && !ogDescription) ogDescription = content;
			if (property === 'og:image' && !ogImage) ogImage = absoluteUrl(content ?? '', baseUrl);
		}
	}

	return {
		title,
		alternates,
		relMe,
		links,
		iconUrl,
		cardName,
		cardNote: bioText(decodeEntities(note)),
		description: bioText(description ?? ogDescription ?? ''),
		photoUrl: cardPhoto ?? ogImage,
		isHtml,
		hasViewport
	};
}

/** Text as a bio shows it: spaces collapsed, cut at a word past `MAX_BIO`. */
function bioText(raw: string): string | null {
	const text = raw.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	if (text.length <= MAX_BIO) return text;
	const cut = text.slice(0, MAX_BIO);
	return `${cut.slice(0, cut.lastIndexOf(' ') > MAX_BIO * 0.7 ? cut.lastIndexOf(' ') : MAX_BIO).trimEnd()}…`;
}

/**
 * A lightweight guess at how a site is built to be read, from a page already in hand.
 *
 * A page made for phones says so with a viewport meta tag; one without it renders as a shrunken
 * desktop page on a phone. That is a signal, not a declaration, so the answer is `undefined`
 * whenever there is nothing to go on (the document was not a page at all) and callers treat
 * `undefined` as mobile friendly. A creator's own declaration, when there is one, always wins.
 */
export function layoutSignal(page: ScannedPage): SiteLayout | undefined {
	if (!page.isHtml) return undefined;
	return page.hasViewport ? 'mobile-friendly' : 'desktop-first';
}

/** Feed content types, for telling a real alternate link from a stylesheet or a translation. */
const FEED_TYPES = new Set([
	'application/rss+xml',
	'application/atom+xml',
	'application/feed+json',
	'application/json',
	'application/rdf+xml',
	'text/xml',
	'application/xml'
]);

export function isFeedLink(link: PageLink): boolean {
	if (FEED_TYPES.has(link.type)) return true;
	// A missing type is common on hand written pages; fall back to the shape of the URL.
	if (!link.type) return /\.(rss|atom|xml|json)(\?|$)|\/(feed|rss|atom)\/?(\?|$)/i.test(link.href);
	return false;
}

/** True when a page links back to `target` with rel=me, completing a two way verification. */
export function linksBackTo(page: ScannedPage, target: string): boolean {
	const normalize = (value: string) =>
		value
			.replace(/^https?:\/\//, '')
			.replace(/^www\./, '')
			.replace(/\/+$/, '')
			.toLowerCase();
	const wanted = normalize(target);
	return page.relMe.some((href) => normalize(href) === wanted);
}
