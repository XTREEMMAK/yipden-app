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
import {
	assessCapture,
	canRecheck,
	defaultDeps,
	recheck,
	type CaptureDeps,
	type CaptureRefusal
} from './references/capture.js';

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

export type AddTrackResult = 'added' | 'already-added' | 'unsafe' | 'full' | CaptureRefusal;

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
		...(reference.foundOnPage ? { foundOn: reference.foundOnPage } : {}),
		...(reference.status === 'gone' ? { gone: true } : {})
	};
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A reference is checked again in the background at most this often. */
const RECHECK_EVERY_MS = 7 * DAY_MS;
/** Opening one checks it again, unless it was checked this recently. */
const RECHECK_ON_OPEN_MS = 60 * 60 * 1000;
/** Background checks per pass, so a launch never turns into a crawl of every kept file. */
const RECHECKS_PER_PASS = 5;

class CreatorNotes {
	references = $state<Reference[]>([]);
	layouts = $state<LayoutMap>({});
	private loading: Promise<void> | null = null;
	private checking = false;
	/** Checked this session without an answer (offline): left for the next launch, not retried. */
	private unanswered = new Set<string>();
	/** Swapped in tests, which must not reach the network. */
	captureDeps: () => CaptureDeps = defaultDeps;

	load(): Promise<void> {
		this.loading ??= this.read();
		return this.loading;
	}

	/** Read again from the store, after something other than this changed it (a restore). */
	reload(): Promise<void> {
		this.loading = this.read(true);
		return this.loading;
	}

	/** `replace`: the store's word is final (a reload). Otherwise, keep what was added meanwhile. */
	private async read(replace = false): Promise<void> {
		await store.init();
		const [references, layouts] = await Promise.all([
			store.listReferences(),
			store.getSetting<LayoutMap>('layoutOverrides')
		]);
		// Anything kept while loading was already written; keep it rather than lose it here.
		if (replace) {
			this.references = references;
			this.layouts = layouts ?? {};
			return;
		}
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
		const assessed = await assessCapture(
			{
				kind: 'audio',
				url,
				creatorUrl: creator.url,
				...(foundOn ? { foundOnPage: foundOn } : {})
			},
			this.captureDeps()
		);
		if (!assessed.ok) return assessed.reason;
		// Checked against the store again: the capture rules took network time.
		if (this.referencesFor(creator.url, 'audio').some((reference) => reference.url === url)) {
			return 'already-added';
		}
		const reference: Reference = {
			id: referenceId(creatorId, 'audio', url),
			kind: 'audio',
			creatorId,
			...ringFields(creator.ring),
			title: (draft.title?.trim() || titleFromUrl(url)).slice(0, MAX_TITLE),
			url,
			...(foundOn ? { foundOnPage: foundOn } : {}),
			...assessed.fields,
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
	 * Check kept references again in the background: the ones never checked, then the longest
	 * since, a few per pass and none checked within the week. Run on launch and on resume.
	 */
	async recheckDue(now = new Date()): Promise<void> {
		if (this.checking) return;
		this.checking = true;
		try {
			await this.load();
			const due = this.references
				.filter(
					(reference) =>
						reference.status === 'live' &&
						canRecheck(reference) &&
						!this.unanswered.has(reference.id) &&
						(!reference.checkedAt ||
							now.getTime() - Date.parse(reference.checkedAt) > RECHECK_EVERY_MS)
				)
				.sort((a, b) => (a.checkedAt ?? '').localeCompare(b.checkedAt ?? ''))
				.slice(0, RECHECKS_PER_PASS);
			for (const reference of due) await this.checkOne(reference);
		} finally {
			this.checking = false;
		}
	}

	/** Check one again because the reader just opened it, unless it was checked very recently. */
	async recheckOnOpen(id: string, now = new Date()): Promise<void> {
		const reference = this.references.find((entry) => entry.id === id);
		if (!reference) return;
		if (
			reference.checkedAt &&
			now.getTime() - Date.parse(reference.checkedAt) < RECHECK_ON_OPEN_MS
		) {
			return;
		}
		await this.checkOne(reference);
	}

	private async checkOne(reference: Reference): Promise<void> {
		const check = await recheck(reference, this.captureDeps()).catch(() => null);
		if (!check) {
			this.unanswered.add(reference.id);
			return;
		}
		this.unanswered.delete(reference.id);
		await store.updateReferenceCheck(reference.id, check);
		this.references = this.references.map((entry) =>
			entry.id === reference.id ? { ...entry, ...check } : entry
		);
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
		const opened = this.referencesFor(creator.url, 'audio').find((entry) => entry.url === trackUrl);
		if (opened) void this.recheckOnOpen(opened.id);
		const tracks = this.tracksFor(creator.url).filter((track) => !track.gone);
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
