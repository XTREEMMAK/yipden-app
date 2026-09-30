import { absoluteUrl, FeedHttp, tokenize } from '@yipden/feeds';
import { safeUrl, type PartnerCandidate } from '@yipden/ring-client';
import { httpFetch } from '../platform/http.js';
import type { PartnerSource } from './registry.js';

/**
 * Knifebeetle (https://knifebeetle.neocities.org/), a webcomic ring, read for testing.
 *
 * A second real, uncooperative shape on purpose, not a repeat of Musicians Webring's: a custom
 * hand-built page, no shared ring engine, ten genre sections, and two different hand-written
 * templates for a listing ("Read:" / "Follow:" on their own lines, or one combined "Links:")
 * that happen to agree on the parts this reads. Comments (`<!-- ... -->`) hide an inactive
 * member; `tokenize` already discards comment content entirely, so an inactive member produces
 * no tokens at all and needs no special casing here.
 *
 * Reading it walks the same untrusted-HTML tokenizer used for Musicians Webring and for feed
 * content generally, for the same reason: this is a stranger's markup.
 */

export const KNIFEBEETLE_URL = 'https://knifebeetle.neocities.org/';

/** One client for this source alone: robots.txt honored, its own per-host throttle and size cap. */
const http = new FeedHttp({ fetch: httpFetch });

/**
 * Each comic sits in one `<div class="desc">`, its own `<h4>` naming it and linking to it (that
 * link is taken as the comic's own address: every example checked has its "Read: website" or
 * "Links: website" as the same first link, so the second scan is not needed), a cover image, a
 * first paragraph as the description, and an optional collapsible content-warning block. The
 * nearest preceding `<a name="...">` names which of the ten genre sections a comic is in.
 *
 * Content warnings are not treated as `sensitive`: 57 of 68 comics carry one, for ordinary
 * things like "mild violence", nothing like the 18+ flag IndieNodes' own `explicit` or Musicians
 * Webring's `nsfw` mark. Hiding most of a ring by default over that would be the wrong default
 * to be wrong in, the opposite of the reasoning that put `explicit` behind an opt in elsewhere.
 * The warning text is instead folded into the blurb, visible the same way a content note on a
 * book or film listing already is, never hidden.
 */
export function scrapeKnifebeetleWebring(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];

	const candidates: PartnerCandidate[] = [];
	let genre: string | undefined;

	let inDesc = false;
	let divDepth = 0;
	let href: string | undefined;
	let name = '';
	/** -1 outside the title link; 0 or more is depth inside it. */
	let titleLinkDepth = -1;
	let inH4 = false;
	let sawTitle = false;

	let paragraphCount = 0;
	let inParagraph = false;
	let description = '';

	let thumbUrl: string | undefined;

	let inDetails = false;
	let inSummary = false;
	let warning = '';

	const endDesc = () => {
		if (href && name.trim()) {
			const blurb = [description.replace(/\s+/g, ' ').trim(), warning.replace(/\s+/g, ' ').trim()]
				.filter(Boolean)
				.join(' Content warning: ');
			candidates.push({
				name: name.trim(),
				url: href,
				...(blurb ? { blurb } : {}),
				...(thumbUrl ? { thumbUrl } : {}),
				...(genre ? { tags: [genre] } : {})
			});
		}
		inDesc = false;
		divDepth = 0;
		href = undefined;
		name = '';
		titleLinkDepth = -1;
		inH4 = false;
		sawTitle = false;
		paragraphCount = 0;
		inParagraph = false;
		description = '';
		thumbUrl = undefined;
		warning = '';
	};

	for (const token of tokenize(document)) {
		if (token.type === 'start' && token.name === 'a' && 'name' in token.attributes) {
			genre = token.attributes.name.toLowerCase();
			continue;
		}

		if (!inDesc) {
			if (token.type === 'start' && token.name === 'div' && token.attributes.class === 'desc') {
				inDesc = true;
				divDepth = 1;
			}
			continue;
		}

		// Anything past here is inside the current comic's own .desc block.
		if (token.type === 'start' && token.name === 'div' && !token.selfClosing) divDepth += 1;
		else if (token.type === 'end' && token.name === 'div') {
			divDepth -= 1;
			if (divDepth <= 0) {
				endDesc();
				continue;
			}
		}

		if (token.type === 'start' && token.name === 'h4') inH4 = true;
		else if (token.type === 'end' && token.name === 'h4') inH4 = false;

		if (inH4 && !sawTitle) {
			if (
				token.type === 'start' &&
				token.name === 'a' &&
				titleLinkDepth < 0 &&
				href === undefined
			) {
				href = safeUrl(token.attributes.href)?.toString();
				titleLinkDepth = href ? 0 : -1;
			} else if (titleLinkDepth >= 0) {
				if (token.type === 'text') name += token.value;
				else if (token.type === 'start' && !token.selfClosing) titleLinkDepth += 1;
				else if (token.type === 'end') {
					if (token.name === 'a') {
						titleLinkDepth = -1;
						sawTitle = true;
					} else titleLinkDepth -= 1;
				}
			}
		}

		if (token.type === 'start' && token.name === 'img' && token.attributes.class === 'comicicon') {
			const absolute = absoluteUrl(token.attributes.src, KNIFEBEETLE_URL);
			if (absolute && !thumbUrl) thumbUrl = absolute;
		}

		if (token.type === 'start' && token.name === 'details') inDetails = true;
		else if (token.type === 'end' && token.name === 'details') inDetails = false;
		else if (token.type === 'start' && token.name === 'summary') inSummary = true;
		else if (token.type === 'end' && token.name === 'summary') inSummary = false;
		else if (inDetails && !inSummary && token.type === 'text') warning += token.value;

		if (!inDetails) {
			if (token.type === 'start' && token.name === 'p') {
				paragraphCount += 1;
				inParagraph = paragraphCount === 1;
			} else if (token.type === 'end' && token.name === 'p') {
				inParagraph = false;
			} else if (inParagraph && token.type === 'text') {
				description += token.value;
			}
		}
	}
	if (inDesc) endDesc();

	return candidates;
}

export const knifebeetleSource: PartnerSource = {
	adapter: {
		ring: { id: 'knifebeetle', name: 'Knifebeetle', hubUrl: KNIFEBEETLE_URL },
		capabilities: ['thumbnails', 'tags'],
		read: scrapeKnifebeetleWebring
	},
	load: async () => (await http.get(KNIFEBEETLE_URL, { accept: 'text/html' })).body
};
