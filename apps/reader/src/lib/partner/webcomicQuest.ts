import { absoluteUrl, tokenize } from '@yipden/feeds';
import { safeUrl, type PartnerCandidate } from '@yipden/ring-client';
import { hasClass, livePartnerSource, plain } from './live.js';

/**
 * WebcomicQuest (https://webcomic.quest/), a webring for longform webcomics. Its onionring list
 * (`onionring-variables.js`) has addresses only, so it is read from the home page's own "Our
 * Member Comics" gallery instead: each comic's link, its picture and its name.
 */

export const WEBCOMIC_QUEST_URL = 'https://webcomic.quest/';

export function scrapeWebcomicQuest(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];
	const candidates: PartnerCandidate[] = [];
	let item: { url: string; name: string; blurb: string; thumbUrl?: string } | null = null;
	let field: 'name' | 'desc' | null = null;

	for (const token of tokenize(document)) {
		if (token.type === 'start' && token.name === 'a' && hasClass(token.attributes, 'wplp_link')) {
			const url = safeUrl(token.attributes.href)?.toString() ?? token.attributes.href ?? '';
			item = { url, name: '', blurb: '' };
			continue;
		}
		if (!item) continue;
		if (token.type === 'start' && token.name === 'img' && !item.thumbUrl) {
			const src = absoluteUrl(token.attributes.src, WEBCOMIC_QUEST_URL);
			if (src) item.thumbUrl = src;
		} else if (token.type === 'start' && token.name === 'p') {
			field = hasClass(token.attributes, 'wplp_display')
				? 'name'
				: hasClass(token.attributes, 'wplp_desc')
					? 'desc'
					: null;
		} else if (token.type === 'end' && token.name === 'p') {
			field = null;
		} else if (token.type === 'text' && field === 'name') {
			item.name += token.value;
		} else if (token.type === 'text' && field === 'desc') {
			item.blurb += token.value;
		} else if (token.type === 'end' && token.name === 'a') {
			candidates.push({
				name: plain(item.name),
				url: item.url,
				blurb: plain(item.blurb),
				...(item.thumbUrl ? { thumbUrl: item.thumbUrl } : {})
			});
			item = null;
			field = null;
		}
	}
	return candidates;
}

export const webcomicQuestSource = livePartnerSource(
	{
		ring: {
			id: 'webcomic-quest',
			name: 'WebcomicQuest',
			hubUrl: WEBCOMIC_QUEST_URL,
			iconUrl: 'https://webcomic.quest/wp-content/uploads/2026/03/cropped-Quest-Logo.png'
		},
		capabilities: ['thumbnails'],
		read: scrapeWebcomicQuest
	},
	WEBCOMIC_QUEST_URL
);
