import { previewKindOf, safeUrl, type SiteLayout } from '@yipden/ring-client';
import { openExternal } from './platform/external.js';
import { player, type QueueItem } from './player.svelte.js';
import { store } from './store/index.js';
import { MAX_TRACKS_PER_CREATOR, titleFromUrl, type ReaderTrack } from './readerTracks.js';
import { verdictKey } from './verdicts.svelte.js';

export { MAX_TRACKS_PER_CREATOR, titleFromUrl, type ReaderTrack };

/**
 * What a reader has added about a creator on their own phone: tracks they found, and whether
 * the creator's site reads best on a phone or a bigger screen.
 *
 * Reader intent, never the creator's word: a track here is labelled "Added by you" everywhere it
 * shows and is never treated as the creator's chosen sample. Only the address is kept; nothing is
 * downloaded. Keyed by the creator's site like Liked and Not for me, so it follows the creator
 * across rings and into a follow. Stored as two settings and carried in the backup.
 */

export type TrackMap = Record<string, ReaderTrack[]>;
export type LayoutMap = Record<string, SiteLayout>;

const MAX_TITLE = 200;

export type AddTrackResult = 'added' | 'already-added' | 'unsafe' | 'full';

class CreatorNotes {
	tracks = $state<TrackMap>({});
	layouts = $state<LayoutMap>({});
	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= this.read();
		return this.loading;
	}

	private async read(): Promise<void> {
		await store.init();
		const [tracks, layouts] = await Promise.all([
			store.getSetting<TrackMap>('readerTracks'),
			store.getSetting<LayoutMap>('layoutOverrides')
		]);
		this.tracks = { ...(tracks ?? {}), ...this.tracks };
		this.layouts = { ...(layouts ?? {}), ...this.layouts };
	}

	tracksFor(creatorUrl: string): ReaderTrack[] {
		return this.tracks[verdictKey(creatorUrl)] ?? [];
	}

	async addTrack(
		creatorUrl: string,
		draft: { url: string; title?: string; foundOn?: string }
	): Promise<AddTrackResult> {
		await this.load();
		const safe = safeUrl(draft.url.trim());
		if (!safe) return 'unsafe';
		const url = safe.toString();
		const key = verdictKey(creatorUrl);
		const existing = this.tracks[key] ?? [];
		if (existing.some((track) => track.url === url)) return 'already-added';
		if (existing.length >= MAX_TRACKS_PER_CREATOR) return 'full';
		const foundOn = draft.foundOn ? safeUrl(draft.foundOn)?.toString() : undefined;
		const track: ReaderTrack = {
			url,
			title: (draft.title?.trim() || titleFromUrl(url)).slice(0, MAX_TITLE),
			addedAt: new Date().toISOString(),
			...(foundOn ? { foundOn } : {})
		};
		this.tracks = { ...this.tracks, [key]: [...existing, track] };
		await store.setSetting('readerTracks', $state.snapshot(this.tracks));
		return 'added';
	}

	async removeTrack(creatorUrl: string, trackUrl: string): Promise<void> {
		await this.load();
		const key = verdictKey(creatorUrl);
		const left = (this.tracks[key] ?? []).filter((track) => track.url !== trackUrl);
		const next = { ...this.tracks };
		if (left.length) next[key] = left;
		else delete next[key];
		this.tracks = next;
		await store.setSetting('readerTracks', $state.snapshot(this.tracks));
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
