import { safeUrl } from '@yipden/ring-client';
import type { ReaderTrack } from '../readerTracks.js';
import { MAX_PER_KIND, MAX_TITLE, referenceId, type Reference } from './types.js';

/**
 * Reader tracks as they were kept before references (one setting, a list per creator) turned
 * into audio references. Used once by the store and by every import of an older backup.
 *
 * What a track never recorded stays honest: which ring its creator came from is unknown
 * (`none`), and nothing was checked, so it is neither host-verified nor sharable until a re-check
 * says otherwise. A known platform's player (Bandcamp and the like) stays a link that opens on the
 * platform, as it always did.
 */
export function referencesFromTracks(tracks: unknown): Reference[] {
	if (!tracks || typeof tracks !== 'object' || Array.isArray(tracks)) return [];
	const out: Reference[] = [];
	for (const [creatorId, list] of Object.entries(tracks as Record<string, unknown>)) {
		if (!Array.isArray(list)) continue;
		for (const raw of list.slice(0, MAX_PER_KIND.audio)) {
			const track = raw as Partial<ReaderTrack> | null;
			const url = typeof track?.url === 'string' ? safeUrl(track.url)?.toString() : undefined;
			if (!url) continue;
			const foundOn =
				typeof track?.foundOn === 'string' ? safeUrl(track.foundOn)?.toString() : undefined;
			const createdAt =
				typeof track?.addedAt === 'string'
					? track.addedAt.slice(0, 100)
					: new Date(0).toISOString();
			out.push({
				id: referenceId(creatorId, 'audio', url),
				kind: 'audio',
				creatorId,
				ringSource: 'none',
				ringId: null,
				title: (typeof track?.title === 'string' ? track.title : '').slice(0, MAX_TITLE) || url,
				url,
				canonicalUrl: url,
				...(foundOn ? { foundOnPage: foundOn } : {}),
				hostVerified: false,
				sharable: false,
				status: 'live',
				createdAt
			});
		}
	}
	return out;
}
