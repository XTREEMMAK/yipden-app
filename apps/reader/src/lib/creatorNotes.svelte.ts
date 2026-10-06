import { previewKindOf, safeUrl, type SiteLayout } from '@yipden/ring-client';
import { embedOf } from './embeds/source.js';
import { openExternal } from './platform/external.js';
import { player, type QueueItem } from './player.svelte.js';
import { shuffled } from './queue.js';
import { store } from './store/index.js';
import { MAX_TRACKS_PER_CREATOR, titleFromUrl, type ReaderTrack } from './readerTracks.js';
import {
	MAX_PER_KIND,
	MAX_TITLE,
	referenceId,
	ringFields,
	type Reference,
	type ReferenceKind,
	type RingOrigin,
	type TextSelector
} from './references/types.js';
import { textFragmentUrl } from './references/textFragment.js';
import { verdictKey } from './verdicts.svelte.js';
import {
	assessCapture,
	canRecheck,
	creatorSites,
	defaultDeps,
	precheckCapture,
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
	/** Their name, kept on the reference so the Library can say whose it is. */
	name?: string;
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

	/**
	 * Keep something found on a creator's page: a track, a picture or a passage. The capture rules
	 * decide whether it may be kept for them, and what is true of it (`references/capture.ts`).
	 */
	async keep(
		creator: TrackCreator,
		draft: {
			kind: ReferenceKind;
			url: string;
			title?: string;
			foundOn?: string;
			selector?: TextSelector;
		}
	): Promise<AddTrackResult> {
		await this.load();
		const safe = safeUrl(draft.url.trim());
		if (!safe) return 'unsafe';
		// A passage's address is its page, without any fragment the reader happened to be at.
		const url = draft.kind === 'text' ? safe.toString().replace(/#.*$/, '') : safe.toString();
		const creatorId = verdictKey(creator.url);
		const id = referenceId(creatorId, draft.kind, url, draft.selector);
		const already = () => this.references.some((reference) => reference.id === id);
		if (already()) return 'already-added';
		if (this.referencesFor(creator.url, draft.kind).length >= MAX_PER_KIND[draft.kind]) {
			return 'full';
		}
		const foundOn = draft.foundOn ? safeUrl(draft.foundOn)?.toString() : undefined;
		const foundOnPage = draft.kind === 'text' ? url : foundOn;
		const assessed = await assessCapture(
			{
				kind: draft.kind,
				url,
				creatorUrl: creator.url,
				...(foundOnPage ? { foundOnPage } : {}),
				...(draft.selector ? { selector: draft.selector } : {})
			},
			this.captureDeps()
		);
		if (!assessed.ok) return assessed.reason;
		// Checked again: the capture rules took network time.
		if (already()) return 'already-added';
		const reference: Reference = {
			id,
			kind: draft.kind,
			creatorId,
			...(creator.name?.trim() ? { creatorName: creator.name.trim().slice(0, MAX_TITLE) } : {}),
			...ringFields(creator.ring),
			title: (draft.title?.trim() || titleFromUrl(url)).slice(0, MAX_TITLE),
			url,
			...(foundOnPage ? { foundOnPage } : {}),
			...(draft.selector
				? { selector: draft.selector, textFragmentUrl: textFragmentUrl(url, draft.selector) }
				: {}),
			...assessed.fields,
			status: 'live',
			createdAt: new Date().toISOString()
		};
		this.references = [...this.references, reference];
		await store.putReference(reference);
		return 'added';
	}

	/**
	 * Which of these tracks Keep would refuse, and why, before any Keep is offered. Missing from
	 * the map: Keep can be tried. The creator's own sites are looked up once for all of them.
	 */
	async precheckTracks(
		creator: TrackCreator,
		drafts: { url: string; foundOn?: string }[]
	): Promise<Map<string, AddTrackResult>> {
		const refused = new Map<string, AddTrackResult>();
		const deps = this.captureDeps();
		const sites = await creatorSites(creator.url, deps);
		await Promise.all(
			drafts.map(async (draft) => {
				const url = safeUrl(draft.url.trim())?.toString();
				if (!url) {
					refused.set(draft.url, 'unsafe');
					return;
				}
				const foundOnPage = draft.foundOn ? safeUrl(draft.foundOn)?.toString() : undefined;
				const why = await precheckCapture(
					{ kind: 'audio', url, ...(foundOnPage ? { foundOnPage } : {}) },
					sites,
					deps
				);
				if (why) refused.set(draft.url, why);
			})
		);
		return refused;
	}

	/** A track: an audio reference, kept the way every reference is. */
	addTrack(
		creator: TrackCreator,
		draft: { url: string; title?: string; foundOn?: string }
	): Promise<AddTrackResult> {
		return this.keep(creator, { kind: 'audio', ...draft });
	}

	async removeReference(id: string): Promise<void> {
		await this.load();
		this.references = this.references.filter((reference) => reference.id !== id);
		await store.removeReference(id);
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
	 * Play a reader's track through the one shared player: a real audio file, or a platform's own
	 * player (YouTube, SoundCloud, Bandcamp; see `embeds/`). Anything else, such as a Bandcamp
	 * track page with no player address, opens on its own site.
	 */
	play(
		creator: { url: string; name: string; artUrl?: string | null },
		trackUrl: string,
		fromEl?: HTMLElement
	): void {
		const opened = this.referencesFor(creator.url, 'audio').find((entry) => entry.url === trackUrl);
		if (opened) void this.recheckOnOpen(opened.id);
		const tracks = this.tracksFor(creator.url).filter((track) => !track.gone);
		const playable = tracks.filter(
			(track) => previewKindOf(track.url) === 'file' || embedOf(track.url) !== null
		);
		const start = playable.findIndex((track) => track.url === trackUrl);
		if (start === -1) {
			openExternal(trackUrl);
			return;
		}
		const queue: QueueItem[] = playable.map((track) => ({
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

	/**
	 * Kept tracks from every creator that play here (a file, or a platform's player), other than
	 * the addresses in `exclude`: what "keep going" can draw on once a queue has run out.
	 */
	playableTracks(exclude: ReadonlySet<string> = new Set()): Reference[] {
		return this.references.filter(
			(reference) =>
				reference.kind === 'audio' &&
				reference.status === 'live' &&
				!exclude.has(reference.url) &&
				(previewKindOf(reference.url) === 'file' || embedOf(reference.url) !== null)
		);
	}

	/** A shuffled run of the Library's tracks, for "keep going" at the end of a queue. */
	libraryQueue(
		exclude: ReadonlySet<string> = new Set(),
		limit = 25,
		random: () => number = Math.random
	): QueueItem[] {
		return shuffled(this.playableTracks(exclude), random)
			.slice(0, limit)
			.map((reference) => {
				const siteUrl = `https://${reference.creatorId}`;
				return {
					id: `reader:${reference.url}`,
					title: reference.title,
					creator: reference.creatorName ?? reference.creatorId,
					url: reference.foundOnPage ?? siteUrl,
					siteUrl,
					artUrl: null,
					mediaUrl: reference.url,
					batchKey: `reader:${reference.creatorId}`
				};
			});
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
