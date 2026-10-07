import { tokenize } from '@yipden/feeds';
import { safeUrl, type PartnerCandidate } from '@yipden/ring-client';
import { hasClass, livePartnerSource, plain } from './live.js';

/**
 * WeBringTheMusic (https://www.webringthemusic.info/), a webring of independent musicians, read
 * from its own directory page: one table row per artist, with their name, their site, a short
 * description, and often their Bandcamp, which this offers as their sample (`preview`), opened
 * outside the app like any partner member's.
 */

export const WEBRINGTHEMUSIC_URL = 'https://www.webringthemusic.info/directory';

export function scrapeWebringTheMusic(document: unknown): PartnerCandidate[] {
	if (typeof document !== 'string') return [];
	const candidates: PartnerCandidate[] = [];
	let row: { name: string; url?: string; blurb: string; previewUrl?: string } | null = null;
	let field: 'name' | 'site' | 'desc' | null = null;

	const end = () => {
		if (row?.url) {
			candidates.push({
				name: plain(row.name),
				url: row.url,
				blurb: plain(row.blurb),
				...(row.previewUrl ? { previewUrl: row.previewUrl } : {})
			});
		}
		row = null;
		field = null;
	};

	for (const token of tokenize(document)) {
		if (token.type === 'start' && token.name === 'tr') {
			end();
			row = { name: '', blurb: '' };
			continue;
		}
		if (token.type === 'end' && token.name === 'tr') {
			end();
			continue;
		}
		if (!row) continue;
		if (token.type === 'start') {
			if (token.name === 'span' && hasClass(token.attributes, 'artist-name')) field = 'name';
			else if (token.name === 'td' && hasClass(token.attributes, 'artist-url')) field = 'site';
			else if (token.name === 'td' && hasClass(token.attributes, 'artist-desc')) field = 'desc';
			else if (token.name === 'a' && hasClass(token.attributes, 'bandcamp-link')) {
				const link = safeUrl(token.attributes.href);
				if (link && !row.previewUrl) row.previewUrl = link.toString();
			} else if (token.name === 'a' && field === 'site') {
				const link = safeUrl(token.attributes.href);
				if (link && !row.url) row.url = link.toString();
			}
			continue;
		}
		if (token.type === 'end' && (token.name === 'span' || token.name === 'td')) {
			if (field === 'name' && token.name === 'span') field = null;
			else if (field !== 'name' && token.name === 'td') field = null;
			continue;
		}
		if (token.type === 'text') {
			if (field === 'name') row.name += token.value;
			else if (field === 'desc') row.blurb += ` ${token.value}`;
		}
	}
	end();
	return candidates;
}

export const webringTheMusicSource = livePartnerSource(
	{
		ring: {
			id: 'webringthemusic',
			name: 'WeBringTheMusic',
			hubUrl: 'https://www.webringthemusic.info/',
			iconUrl: 'https://www.webringthemusic.info/static/favicon.ico'
		},
		capabilities: ['preview'],
		read: scrapeWebringTheMusic
	},
	WEBRINGTHEMUSIC_URL
);
