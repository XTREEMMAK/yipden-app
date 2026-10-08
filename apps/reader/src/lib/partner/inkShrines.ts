import { absoluteUrl, tokenize } from '@yipden/feeds';
import { safeUrl, type PartnerCandidate } from '@yipden/ring-client';
import { hasClass, livePartnerSource, plain } from './live.js';

/**
 * Ink Shrines (https://www.inkshrines.sloanesloane.com/), a webring of cartoonists, read from its
 * home page: a section per genre (its `<h2>`, kept as the member's genre tag), and a card per
 * cartoonist with their picture, name, a few lines about them, and their links. Their own site is
 * the first link that is not a social or patronage platform. As with every partner ring, a member
 * whose link is plain `http://` is dropped at the boundary, and this ring has many.
 */

export const INK_SHRINES_URL = 'https://www.inkshrines.sloanesloane.com/';

const NOT_THEIR_SITE =
	/(^|\.)(twitter\.com|x\.com|patreon\.com|instagram\.com|ko-fi\.com|facebook\.com|bsky\.app)$/i;

export function scrapeInkShrines(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];
	const candidates: PartnerCandidate[] = [];
	let genre: string | null = null;
	let inGenre = false;
	let thumb: string | undefined;
	let card: { name: string; blurb: string; url?: string; thumbUrl?: string } | null = null;
	let inName = false;
	let inBlurb = false;

	const end = () => {
		if (card?.url) {
			candidates.push({
				name: plain(card.name),
				url: card.url,
				blurb: plain(card.blurb),
				...(card.thumbUrl ? { thumbUrl: card.thumbUrl } : {}),
				...(genre ? { tags: [genre] } : {})
			});
		}
		card = null;
	};

	for (const token of tokenize(document)) {
		if (token.type === 'start' && token.name === 'h2') {
			end();
			inGenre = true;
			genre = '';
			continue;
		}
		if (token.type === 'end' && token.name === 'h2') {
			inGenre = false;
			genre = plain(genre ?? '').toLowerCase() || null;
			continue;
		}
		if (inGenre && token.type === 'text') {
			genre += token.value;
			continue;
		}
		if (
			token.type === 'start' &&
			token.name === 'img' &&
			hasClass(token.attributes, 'cards-image')
		) {
			end();
			thumb = absoluteUrl(token.attributes.src, INK_SHRINES_URL) ?? undefined;
			continue;
		}
		if (token.type === 'start' && token.name === 'h3') {
			end();
			card = { name: '', blurb: '', ...(thumb ? { thumbUrl: thumb } : {}) };
			thumb = undefined;
			inName = true;
			continue;
		}
		if (!card) continue;
		if (token.type === 'end' && token.name === 'h3') inName = false;
		else if (token.type === 'start' && token.name === 'p') inBlurb = true;
		else if (token.type === 'end' && token.name === 'p') inBlurb = false;
		else if (token.type === 'text' && inName) card.name += token.value;
		else if (token.type === 'text' && inBlurb) card.blurb += token.value;
		else if (token.type === 'start' && token.name === 'a' && card.url === undefined) {
			const link = safeUrl(token.attributes.href);
			const raw = token.attributes.href ?? '';
			// The first link that is theirs decides: plain http is not skipped past, it is the
			// member's site, and the boundary drops it like any other partner ring's.
			let host: string;
			try {
				host = new URL(raw).hostname;
			} catch {
				continue;
			}
			if (NOT_THEIR_SITE.test(host)) continue;
			card.url = link?.toString() ?? raw;
		}
	}
	end();
	return candidates;
}

export const inkShrinesSource = livePartnerSource(
	{
		ring: {
			id: 'ink-shrines',
			name: 'Ink Shrines',
			hubUrl: INK_SHRINES_URL,
			iconUrl: 'https://www.inkshrines.sloanesloane.com/images/sparkle.png'
		},
		capabilities: ['thumbnails', 'tags'],
		read: scrapeInkShrines
	},
	INK_SHRINES_URL
);
