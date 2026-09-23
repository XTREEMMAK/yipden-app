import { tokenize } from './tokenize.js';
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
}

const MAX_LINKS = 500;

function relTokens(value: string | undefined): string[] {
	return (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
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

	let inTitle = false;
	let pendingCardName = false;
	let anchorText = '';
	let inAnchor = false;

	for (const token of tokenize(html)) {
		if (token.type === 'text') {
			if (inTitle && !title) title = token.value.trim() || null;
			if (pendingCardName && !cardName) cardName = token.value.trim() || null;
			if (inAnchor) anchorText += token.value;
			continue;
		}

		if (token.type === 'end') {
			if (token.name === 'title') inTitle = false;
			if (token.name === 'a') inAnchor = false;
			pendingCardName = false;
			continue;
		}

		const { name, attributes } = token;

		if (name === 'title' && !title) {
			inTitle = true;
			continue;
		}

		const classes = relTokens(attributes.class);
		if (!cardName && (classes.includes('p-name') || classes.includes('fn'))) {
			pendingCardName = true;
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

		if (name === 'meta' && !title) {
			const property = (attributes.property ?? attributes.name ?? '').toLowerCase();
			if (property === 'og:site_name' || property === 'og:title') {
				title = attributes.content?.trim() || null;
			}
		}
	}

	return { title, alternates, relMe, links, iconUrl, cardName };
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
