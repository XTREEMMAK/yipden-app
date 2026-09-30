import { FeedHttp, absoluteUrl, tokenize } from '@yipden/feeds';
import { safeUrl, type PartnerCandidate } from '@yipden/ring-client';
import { httpFetch } from '../platform/http.js';
import type { PartnerSource } from './registry.js';

/**
 * Musicians Webring (https://lydels.neocities.org/musicianswebring/webring), read for testing.
 *
 * There is no JSON here and no schema: the maintainer hand-writes a member table into a page
 * built for a person to read, not a client. That is exactly why this is worth building against
 * before the first ring whose maintainer has agreed to anything (see docs/ring-contract.md and
 * DECISIONS.md): it proves the adapter boundary against a real, uncooperative shape rather than
 * only the fixture. It is testing only, not a shipped inclusion; see `registry.ts` for the gate
 * and DECISIONS.md for why.
 *
 * Reading it walks the same untrusted-HTML tokenizer `packages/feeds` already trusts for
 * sanitizing feed content and scanning a page for its own feed links (`tokenize`), not a hand
 * rolled regex against a stranger's markup.
 */

export const MUSICIANS_WEBRING_URL = 'https://lydels.neocities.org/musicianswebring/webring';

/** One client for this source alone: robots.txt honored, its own per-host throttle and size cap. */
const http = new FeedHttp({ fetch: httpFetch });

/**
 * Each member is one table row: a first cell with their site link (an image button, or a plain
 * "no button" placeholder div, either way followed by their name as the link's own trailing
 * text) and, rarely, a `<b>nsfw</b>` warning after it; a second cell with their description; a
 * third cell that is either `-` or a link the member gave the ring's own maintainer as their own
 * chosen sample, meant for exactly the thing this reads it for. Nothing here trusts a fixed
 * column count or class name beyond `<tr>`/`<td>`, since a hand maintained page changes its
 * styling far more often than its structure.
 */
export function scrapeMusiciansWebring(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];

	const candidates: PartnerCandidate[] = [];
	let inRow = false;
	let cell = -1;
	let href: string | undefined;
	/** -1 outside the member's own link; 0 or more is depth inside it. */
	let linkDepth = -1;
	let name = '';
	let description = '';
	let warning = false;
	let inWarningTag = false;
	let warningText = '';
	let previewUrl: string | undefined;
	let thumbUrl: string | undefined;

	const endRow = () => {
		if (href) {
			candidates.push({
				name: name.trim(),
				url: href,
				blurb: description.replace(/\s+/g, ' ').trim(),
				sensitive: warning,
				...(previewUrl ? { previewUrl } : {}),
				...(thumbUrl ? { thumbUrl } : {})
			});
		}
		inRow = false;
		cell = -1;
		href = undefined;
		linkDepth = -1;
		name = '';
		description = '';
		warning = false;
		previewUrl = undefined;
		thumbUrl = undefined;
	};

	for (const token of tokenize(document)) {
		if (token.type === 'start' && token.name === 'tr') {
			if (inRow) endRow();
			inRow = true;
			continue;
		}
		if (token.type === 'end' && token.name === 'tr') {
			if (inRow) endRow();
			continue;
		}
		if (!inRow) continue;

		if (token.type === 'start' && token.name === 'td') {
			cell += 1;
			continue;
		}

		if (cell === 0) {
			if (linkDepth < 0 && token.type === 'start' && token.name === 'a' && href === undefined) {
				href = safeUrl(token.attributes.href)?.toString();
				linkDepth = href ? 0 : -1;
				continue;
			}
			if (linkDepth >= 0) {
				// Only text that is a direct child of the link is the member's name: text inside
				// a nested placeholder <div> (the site's own "no button" filler) sits one level
				// deeper and is skipped, the same way an <img>'s alt text never reaches here.
				if (token.type === 'text' && linkDepth === 0) name += token.value;
				else if (
					linkDepth === 0 &&
					token.type === 'start' &&
					token.name === 'img' &&
					thumbUrl === undefined
				) {
					thumbUrl = absoluteUrl(token.attributes.src, MUSICIANS_WEBRING_URL) ?? undefined;
				} else if (token.type === 'start' && !token.selfClosing) linkDepth += 1;
				else if (token.type === 'end') linkDepth = token.name === 'a' ? -1 : linkDepth - 1;
				continue;
			}
			// After the member's own link: the rare nsfw warning is a <b> whose own text says so.
			if (token.type === 'start' && token.name === 'b') {
				inWarningTag = true;
				warningText = '';
			} else if (token.type === 'end' && token.name === 'b' && inWarningTag) {
				inWarningTag = false;
				if (warningText.trim().toLowerCase() === 'nsfw') warning = true;
			} else if (token.type === 'text' && inWarningTag) {
				warningText += token.value;
			}
			continue;
		}

		if (cell === 1 && token.type === 'text') description += token.value;

		if (cell === 2 && previewUrl === undefined && token.type === 'start' && token.name === 'a') {
			previewUrl = safeUrl(token.attributes.href)?.toString();
		}
	}
	if (inRow) endRow();

	return candidates;
}

export const musiciansWebringSource: PartnerSource = {
	adapter: {
		ring: {
			id: 'musicians-webring',
			name: 'Musicians Webring',
			hubUrl: MUSICIANS_WEBRING_URL
		},
		capabilities: ['sensitive', 'preview', 'thumbnails'],
		read: scrapeMusiciansWebring
	},
	load: async () => (await http.get(MUSICIANS_WEBRING_URL, { accept: 'text/html' })).body
};
