import { htmlToText } from './sanitize.js';
import { tokenize } from './tokenize.js';
import { absoluteUrl, sameUrl } from './urls.js';

/**
 * The capture rules for references, as pure functions over what was fetched: whose host a file
 * is on, whether a page links it, and whether the page says "no".
 *
 * Here rather than in the app because the v2.0 shared index has to apply the same rules on the
 * server, the way the poller reuses this package's feed rules.
 */

/** A host without a leading `www.`, lowercased. */
export function bareHost(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return null;
	}
}

/**
 * Whether `url` is on one of `sites`: the same host, or a subdomain of one (`media.lena.example`
 * is on `lena.example`). Never the other way: a creator on `lena.neocities.org` does not own
 * `neocities.org`, so a parent host never counts.
 *
 * Host only, as the brief sets the rule. On a host shared by path (`example.club/~lena`), anyone
 * else on that host passes too; that is the known limit (DECISIONS.md, 2026-10-04).
 */
export function isOnOwnSite(url: string, sites: readonly string[]): boolean {
	const host = bareHost(url);
	if (!host) return false;
	return sites.some((site) => {
		const own = bareHost(site);
		return Boolean(own) && (host === own || host.endsWith(`.${own}`));
	});
}

/** Attributes that point at media or at a page an element shows. */
const LINKING_ATTRIBUTES = ['href', 'src', 'data-src', 'poster', 'content', 'data'] as const;

/** Every address in a `srcset`, without its width or density. */
function srcsetUrls(value: string): string[] {
	return value
		.split(',')
		.map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
		.filter(Boolean);
}

/**
 * Whether a page's own markup links or embeds `target`: an element's `href`, `src`, `srcset`,
 * `poster`, `data` or `data-src`, or a meta tag's `content` (as `og:audio` and `og:image` do).
 * Media a page's script inserts later is not in the markup; the in-app browser sees that when it
 * is captured, but a later re-check cannot, and says so by returning false.
 */
export function linkedOnPage(html: string, pageUrl: string, target: string): boolean {
	for (const token of tokenize(html)) {
		if (token.type !== 'start') continue;
		const { attributes } = token;
		const candidates: string[] = [];
		for (const name of LINKING_ATTRIBUTES) {
			const value = attributes[name];
			if (value) candidates.push(value);
		}
		if (attributes.srcset) candidates.push(...srcsetUrls(attributes.srcset));
		for (const candidate of candidates) {
			if (sameUrl(absoluteUrl(candidate, pageUrl), target)) return true;
		}
	}
	return false;
}

/**
 * Whether a page's visible text still contains a passage, ignoring how whitespace was laid out.
 * The whole page is read: a chapter's last paragraph is as much on the page as its first.
 */
export function textOnPage(html: string, passage: string): boolean {
	const squash = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
	const wanted = squash(passage);
	return wanted.length > 0 && squash(htmlToText(html, { maxLength: 1_000_000 })).includes(wanted);
}

const NO_INDEX = /(^|[\s,])(noindex|none)([\s,]|$)/i;

/** `noindex` (or `none`) in the page's robots meta tags, its own or one naming every robot. */
export function metaNoIndex(html: string): boolean {
	for (const token of tokenize(html)) {
		if (token.type !== 'start' || token.name.toLowerCase() !== 'meta') continue;
		const name = (token.attributes.name ?? '').toLowerCase();
		if (name !== 'robots' && name !== 'yipden') continue;
		if (NO_INDEX.test(token.attributes.content ?? '')) return true;
	}
	return false;
}

/** Directives that contain a colon themselves, so a prefix like these is not an agent's name. */
const COLON_DIRECTIVES = new Set([
	'unavailable_after',
	'max-snippet',
	'max-image-preview',
	'max-video-preview'
]);

/**
 * `noindex` (or `none`) in an `X-Robots-Tag` header, for every agent or for YipDen. A directive
 * after another agent's name (`googlebot: noindex`) is about that agent only, until the next
 * name. Several headers arrive joined by commas, which this reads the same way.
 */
export function headerNoIndex(header: string | null | undefined): boolean {
	if (!header) return false;
	let agent: string | null = null;
	for (const raw of header.slice(0, 4_096).split(',')) {
		let part = raw.trim();
		const prefixed = /^([a-z0-9_-]+)\s*:\s*(.*)$/i.exec(part);
		if (prefixed && !COLON_DIRECTIVES.has(prefixed[1]!.toLowerCase())) {
			agent = prefixed[1]!.toLowerCase();
			part = prefixed[2]!.trim();
		}
		if ((agent === null || agent === 'yipden') && /^(noindex|none)$/i.test(part)) return true;
	}
	return false;
}
