import { absoluteUrl } from '@yipden/feeds';
import type { PartnerCandidate } from '@yipden/ring-client';
import { livePartnerSource } from './live.js';

/**
 * The Homebrew Webring (https://homebrew.cresentri.com/members), read from the `members.json` its
 * own members page loads: each member's name, site, 88x31 button and their own few words.
 */

export const HOMEBREW_MEMBERS_URL = 'https://homebrew.cresentri.com/members.json';

interface HomebrewMember {
	name?: unknown;
	url?: unknown;
	button?: unknown;
	description?: unknown;
}

export function readHomebrewWebring(document: unknown): PartnerCandidate[] {
	let parsed: unknown = document;
	if (typeof document === 'string') {
		try {
			parsed = JSON.parse(document);
		} catch {
			return [];
		}
	}
	const members = (parsed as { members?: unknown } | null)?.members;
	if (!Array.isArray(members)) return [];
	return members.flatMap((member: HomebrewMember) => {
		if (!member || typeof member.url !== 'string' || typeof member.name !== 'string') return [];
		const thumbUrl =
			typeof member.button === 'string' ? absoluteUrl(member.button, HOMEBREW_MEMBERS_URL) : null;
		return [
			{
				name: member.name,
				url: member.url,
				...(typeof member.description === 'string' ? { blurb: member.description } : {}),
				...(thumbUrl ? { thumbUrl } : {})
			}
		];
	});
}

export const homebrewSource = livePartnerSource(
	{
		ring: {
			id: 'homebrew-webring',
			name: 'The Homebrew Webring',
			hubUrl: 'https://homebrew.cresentri.com/members',
			iconUrl: 'https://homebrew.cresentri.com/favicon.ico'
		},
		capabilities: ['thumbnails'],
		read: readHomebrewWebring
	},
	HOMEBREW_MEMBERS_URL
);
