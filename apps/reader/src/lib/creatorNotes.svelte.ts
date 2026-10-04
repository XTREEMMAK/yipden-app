import { previewKindOf, safeUrl, type SiteLayout } from '@yipden/ring-client';
import { openExternal } from './platform/external.js';
import { player, type QueueItem } from './player.svelte.js';
import { store } from './store/index.js';
import { MAX_TRACKS_PER_CREATOR, titleFromUrl, type ReaderTrack } from './readerTracks.js';
import {
	MAX_PER_KIND,
	MAX_TITLE,
	referenceId,
	ringFields,
	type Reference,
	type ReferenceKind,
	type RingOrigin
} from './references/types.js';
import { verdictKey } from './verdicts.svelte.js';

export { MAX_TRACKS_PER_CREATOR, titleFromUrl, type ReaderTrack };

/**
 * What a reader has added about a creator on their own phone: tracks they found, and whether
 * the creator's site reads best on a phone or a bigger screen.
 *
 * Reader intent, never the creator's word: a track here is labelled "Added by you" everywhere it
 * shows and is never treated as the creator's chosen sample. Only the address is kept; nothing is
 * downloaded. Keyed by the creator's site like Liked and Not for me, so it follows the creator
 * across rings and into a follow. Tracks are audio references (`references/types.ts`) in the
 * store; layouts are a setting. Both are carried in the backup.
 */

export type TrackMap = Record<string, ReaderTrack[]>;
export type LayoutMap = Record<string, SiteLayout>;

export type AddTrackResult = 'added' | 'already-added' | 'unsafe' | 'full';

/** Who a track is being kept for: their site, and the ring they were found through, if any. */
export interface TrackCreator {
	url: string;
	ring?: RingOrigin | null;
}

/** A kept audio reference, in the shape the track lists show. */
function asTrack(reference: Reference): ReaderTrack {
	return {
		url: reference.url,
		title: reference.title,
		addedAt: reference.createdAt,
		...(reference.foundOnPage ? { foundOn: reference.foundOnPage } : {})
	};
}

class CreatorNotes {
	references = $state<Reference[]>([]);
	layouts = $state<LayoutMap>({});
	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= this.read();
		return this.loading;
	}

	/** Read again from the store, after something other than this changed it (a restore). */
	reload(): Promise<void> {
		this.loading = this.read();
		return this.loading;
	}

	private async read(): Promise<void> {
		await store.init();
		const [references, layouts] = await Promise.all([
			store.listReferences(),
			store.getSetting<LayoutMap>('layoutOverrides')
		]);
		// Anything kept while loading was already written; keep it rather than lose it here.
		const kept = new Set(references.map((reference) => reference.id));
		this.references = [...references, ...this.references.filter((entry) => !kept.has(entry.id))];
		this.layouts = { ...(layouts ?? {}), ...this.layouts };
	}

	/** Every reference kept for a creator, oldest first, optionally of one kind. */
	referencesFor(creatorUrl: string, kind?: ReferenceKind): Reference[] {
		const creatorId = verdictKey(creatorUrl);
		return this.references.filter(
			(reference) => reference.creatorId === creatorId && (!kind || reference.kind === kind)
		);
	}

	tracksFor(creatorUrl: string): ReaderTrack[] {
		return this.referencesFor(creatorUrl, 'audio').map(asTrack);
	}

	async addTrack(
		creator: TrackCreator,
		draft: { url: string; title?: string; foundOn?: string }
	): Promise<AddTrackResult> {
		await this.load();
		const safe = safeUrl(draft.url.trim());
		if (!safe) return 'unsafe';
		const url = safe.toString();
		const creatorId = verdictKey(creator.url);
		const existing = this.referencesFor(creator.url, 'audio');
		if (existing.some((reference) => reference.url === url)) return 'already-added';
		if (existing.length >= MAX_PER_KIND.audio) return 'full';
		const foundOn = draft.foundOn ? safeUrl(draft.foundOn)?.toString() : undefined;
		const reference: Reference = {
			id: referenceId(creatorId, 'audio', url),
			kind: 'audio',
			creatorId,
			...ringFields(creator.ring),
			title: (draft.title?.trim() || titleFromUrl(url)).slice(0, MAX_TITLE),
			url,
			canonicalUrl: url,
			...(foundOn ? { foundOnPage: foundOn } : {}),
			// Nothing is checked yet: the capture rules decide these (ROADMAP, capture rules).
			hostVerified: false,
			sharable: false,
			status: 'live',
			createdAt: new Date().toISOString()
		};
		this.references = [...this.references, reference];
		await store.putReference(reference);
		return 'added';
	}

	async removeTrack(creatorUrl: string, trackUrl: string): Promise<void> {
		await this.load();
		const gone = this.referencesFor(creatorUrl, 'audio').filter(
			(reference) => reference.url === trackUrl
		);
		if (!gone.length) return;
		const ids = new Set(gone.map((reference) => reference.id));
		this.references = this.references.filter((reference) => !ids.has(reference.id));
		for (const id of ids) await store.removeReference(id);
	}

	/**
	 * Play a reader's track: a real audio file plays here, through the one shared player; anything
	 * else (a platform page) opens on its own site, the same as a ring's own sample.
	 */
	play(
		creator: { url: string; name: string; artUrl?: string | null },
		trackUrl: string,
		fromEl?: HTMLElement
	): void {
		const tracks = this.tracksFor(creator.url);
		const files = tracks.filter((track) => previewKindOf(track.url) === 'file');
		const start = files.findIndex((track) => track.url === trackUrl);
		if (start === -1) {
			openExternal(trackUrl);
			return;
		}
		const queue: QueueItem[] = files.map((track) => ({
			id: `reader:${track.url}`,
			title: track.title,
			creator: creator.name,
			url: track.foundOn ?? creator.url,
			siteUrl: creator.url,
			artUrl: creator.artUrl ?? null,
			mediaUrl: track.url,
			batchKey: `reader:${verdictKey(creator.url)}`
		}));
		player.play(queue, start, fromEl, { loop: false });
	}

	/** The reader's own call when there is one, otherwise what the ring or the page said. */
	layoutFor(creatorUrl: string, declared: SiteLayout | undefined): SiteLayout | undefined {
		return this.layouts[verdictKey(creatorUrl)] ?? declared;
	}

	hasLayoutOverride(creatorUrl: string): boolean {
		return verdictKey(creatorUrl) in this.layouts;
	}

	/** `null` goes back to what the ring or the page said. */
	async setLayout(creatorUrl: string, layout: SiteLayout | null): Promise<void> {
		await this.load();
		const key = verdictKey(creatorUrl);
		const next = { ...this.layouts };
		if (layout) next[key] = layout;
		else delete next[key];
		this.layouts = next;
		await store.setSetting('layoutOverrides', $state.snapshot(this.layouts));
	}
}

export const creatorNotes = new CreatorNotes();
