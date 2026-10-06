<script lang="ts">
	import { browserGuide } from '$lib/browserGuide.svelte.js';
	import Sheet from './Sheet.svelte';
	import { hostOf } from '$lib/hosts.js';
	import { onMount, untrack } from 'svelte';
	import { type PreviewKind } from '@yipden/ring-client';
	import { showKept } from '$lib/references/messages.js';
	import { creatorNotes, type AddTrackResult } from '$lib/creatorNotes.svelte.js';
	import { explored } from '$lib/explored.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { hear } from '$lib/hear.svelte.js';
	import { isPlatformLink } from '$lib/references/capture.js';
	import { siteBrowser, type SiteSession } from '$lib/platform/siteBrowser.svelte.js';
	import { titleFromUrl } from '$lib/readerTracks.js';
	import LayoutPicker from './LayoutPicker.svelte';
	import PlatformIcon from './PlatformIcon.svelte';

	/**
	 * Back from a creator's site through YipDen's toolbar button: what the page showed or played,
	 * for the reader to keep or not. Nothing found is kept until it is picked here, in the app's own
	 * screen, which the page cannot reach.
	 */

	interface Props {
		session: SiteSession;
		/** Back to the page, as the reader left it. */
		onback: () => void;
		/** Close the page for good. */
		ondone: () => void;
	}

	let { session, onback, ondone }: Props = $props();
	const onclose = () => onback();

	const HOW_LABELS = {
		playing: 'Playing on the page',
		element: 'A player on the page',
		link: 'Linked from the page',
		loaded: 'Loaded by the page',
		embed: 'An embedded player'
	} as const;

	const PLATFORM: Partial<Record<PreviewKind, string>> = {
		youtube: 'YouTube',
		soundcloud: 'SoundCloud',
		bandcamp: 'Bandcamp',
		spotify: 'Spotify',
		'apple-music': 'Apple Music'
	};

	/** Why Keep would refuse a track, checked when the sheet opens; null until that is known. */
	let refusals = $state<Map<string, AddTrackResult> | null>(null);

	/** Said under a track that cannot be kept, in place of a Keep that would only refuse. */
	const REFUSED: Partial<Record<AddTrackResult, string>> = {
		temporary: 'Its address expires',
		'not-own-site': 'Not on their site',
		missing: 'Gone',
		unsafe: 'Not a public link'
	};

	/**
	 * What to keep for a track whose address expires: the platform's own player the page names
	 * (it plays in the app), or else the page itself when it is a platform's (it opens there).
	 */
	let lasting = $derived(
		session.found.find((item) => item.how === 'embed' && item.kind !== 'external')?.url ??
			(isPlatformLink('audio', session.pageUrl) ? session.pageUrl : null)
	);

	let added = $derived(
		new Set(creatorNotes.tracksFor(session.creator.url).map((track) => track.url))
	);

	/** A picture is kept as a comic page or a game screenshot; the ring suggests, the reader decides. */
	// Starts from what the creator makes; after that it is the reader's choice, not kept in sync.
	let imageKind = $state<'image' | 'screenshot'>(
		untrack(() => session.creator.imageKind ?? 'image')
	);
	let imageKept = $derived(
		Boolean(
			session.image &&
			creatorNotes
				.referencesFor(session.creator.url)
				.some(
					(entry) =>
						(entry.kind === 'image' || entry.kind === 'screenshot') &&
						entry.url === session.image?.url
				)
		)
	);
	let passageKept = $derived(
		Boolean(
			session.passage &&
			creatorNotes
				.referencesFor(session.creator.url, 'text')
				.some((entry) => entry.selector?.exact === session.passage?.exact)
		)
	);
	let nothing = $derived(!session.found.length && !session.image && !session.passage);

	async function keepImage() {
		const image = session.image;
		if (!image) return;
		checking = new Set(checking).add(image.url);
		try {
			const result = await creatorNotes.keep(session.creator, {
				kind: imageKind,
				url: image.url,
				...(image.alt ? { title: image.alt } : {}),
				foundOn: image.page
			});
			showKept(result, session.creator, imageKind, ondone);
		} finally {
			const next = new Set(checking);
			next.delete(image.url);
			checking = next;
		}
	}

	async function keepPassage() {
		const passage = session.passage;
		if (!passage) return;
		const key = `passage:${passage.exact}`;
		checking = new Set(checking).add(key);
		try {
			const { page, ...selector } = passage;
			const result = await creatorNotes.keep(session.creator, {
				kind: 'text',
				url: page,
				title: passageTitle(passage.exact),
				selector
			});
			showKept(result, session.creator, 'text', ondone);
		} finally {
			const next = new Set(checking);
			next.delete(key);
			checking = next;
		}
	}

	/**
	 * Hear a track before keeping it. The page goes quiet first (it keeps playing while hidden
	 * behind this sheet), and the track plays on its own, apart from the player (`hear`). A second
	 * tap pauses it, and closing the sheet stops it.
	 */
	async function preview(item: SiteSession['found'][number]) {
		if (hear.url !== item.url) await siteBrowser.pausePage();
		hear.toggle(item.url);
	}

	/** A passage's name in lists: its opening words. */
	function passageTitle(exact: string): string {
		return exact.length <= 60 ? exact : `${exact.slice(0, 57).trimEnd()}…`;
	}

	onMount(() => {
		void creatorNotes.load();
		void explored.mark(session.creator.url);
		creatorNotes
			.precheckTracks(
				session.creator,
				session.found.map((item) => ({ url: item.url, foundOn: session.pageUrl }))
			)
			.then((refused) => (refusals = refused))
			// Could not check: offer Keep, which checks again and says why if it refuses.
			.catch(() => (refusals = new Map()));
		return () => hear.stop();
	});

	function titleOf(item: SiteSession['found'][number]): string {
		if (item.title) return item.title;
		const platform = PLATFORM[item.kind];
		return platform ? `${platform} player` : titleFromUrl(item.url);
	}

	/** Being checked against the capture rules, which can take a request or two. */
	let checking = $state<Set<string>>(new Set());

	/** Keep a track: the one found, or, for one whose address expires, the platform page it is on. */
	async function keep(url: string, title: string) {
		checking = new Set(checking).add(url);
		try {
			const result = await creatorNotes.addTrack(session.creator, {
				url,
				title,
				foundOn: session.pageUrl
			});
			showKept(result, session.creator, 'audio', ondone);
		} finally {
			const next = new Set(checking);
			next.delete(url);
			checking = next;
		}
	}
</script>

<Sheet
	title={`Found on ${session.creator.name}'s page`}
	{onclose}
	historyKey="foundOnPage"
	maxHeight="80vh"
	class="found-sheet"
	closeLabel="Back to their page"
>
	<div class="body">
		{#if !nothing}
			<p class="note">
				Keep what you want to come back to. Only its link is saved, on this phone, labelled as added
				by you. It stays on {session.creator.name}’s site, so if you love it, support them there.
				<button class="guide-link" onclick={() => browserGuide.show()}>How finding works</button>
			</p>
		{/if}
		{#if session.image}
			{@const busy = checking.has(session.image.url)}
			<section class="pick" aria-labelledby="found-picture">
				<h3 id="found-picture">The picture you pressed</h3>
				<img
					class="picture"
					src={session.image.url}
					alt={session.image.alt}
					referrerpolicy="no-referrer"
					loading="lazy"
				/>
				<div class="kinds" role="radiogroup" aria-label="Keep it as">
					<label
						><input type="radio" bind:group={imageKind} value="image" disabled={imageKept} /> A comic
						or picture</label
					>
					<label
						><input type="radio" bind:group={imageKind} value="screenshot" disabled={imageKept} /> A game
						screenshot</label
					>
				</div>
				<button
					class="keep wide"
					aria-pressed={imageKept}
					disabled={imageKept || busy}
					aria-busy={busy}
					onclick={keepImage}
				>
					{imageKept ? 'Kept' : busy ? 'Checking…' : 'Keep this picture'}
				</button>
			</section>
		{/if}
		{#if session.passage}
			{@const busy = checking.has(`passage:${session.passage.exact}`)}
			<section class="pick" aria-labelledby="found-passage">
				<h3 id="found-passage">The passage you selected</h3>
				<blockquote>{session.passage.exact}</blockquote>
				<button
					class="keep wide"
					aria-pressed={passageKept}
					disabled={passageKept || busy}
					aria-busy={busy}
					onclick={keepPassage}
				>
					{passageKept ? 'Kept' : busy ? 'Checking…' : 'Keep this passage'}
				</button>
			</section>
		{:else if session.passageTooLong}
			<p class="note">
				That selection is longer than a passage. Select up to 500 characters, then tap the button
				again.
			</p>
		{/if}
		{#if session.found.length}
			<h3 class="tracks-head">Tracks</h3>
			<ul class="list">
				{#each session.found as item (item.url)}
					{@const refused = refusals?.get(item.url)}
					{@const keepPage = refused === 'temporary' && lasting !== null}
					{@const keepUrl = keepPage && lasting ? lasting : item.url}
					{@const kept = added.has(keepUrl)}
					{@const busy = checking.has(keepUrl)}
					<li class="item">
						<!-- A file, or anything the page itself played or had in a player, address or not. -->
						{#if item.kind === 'file' || item.how === 'playing' || item.how === 'element'}
							{@const hearing = hear.url === item.url && hear.playing}
							<button
								class="icon preview"
								aria-label={`${hearing ? 'Pause' : 'Hear'} ${titleOf(item)}`}
								aria-pressed={hearing}
								onclick={() => preview(item)}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									{#if hearing}<path d="M8 5h3v14H8zM13 5h3v14h-3z" />{:else}<path
											d="M8 5v14l11-7z"
										/>{/if}
								</svg>
							</button>
						{:else}
							<span class="icon"><PlatformIcon kind={item.kind} /></span>
						{/if}
						<span class="text">
							<b>{titleOf(item)}</b>
							<small>{HOW_LABELS[item.how]} · {hostOf(item.url)}</small>
							{#if refused && !kept}
								<small class="refused"
									>{REFUSED[refused] ?? 'Cannot be kept'}{keepPage
										? lasting === session.pageUrl
											? '. Keep their page for it'
											: '. Keep its player, which lasts'
										: ', so it cannot be kept'}</small
								>
							{/if}
						</span>
						{#if !refusals}
							<button
								class="keep"
								disabled
								aria-busy="true"
								aria-label={`Checking ${titleOf(item)}`}
							>
								Checking…
							</button>
						{:else if !refused || keepPage}
							<button
								class="keep"
								aria-pressed={kept}
								disabled={kept || busy}
								aria-busy={busy}
								aria-label={kept
									? `${titleOf(item)} kept`
									: busy
										? `Checking ${titleOf(item)}`
										: keepPage
											? `Keep the lasting address for ${titleOf(item)}`
											: `Keep ${titleOf(item)}`}
								onclick={() => keep(keepUrl, titleOf(item))}
							>
								{kept
									? 'Kept'
									: busy
										? 'Checking…'
										: !keepPage
											? 'Keep'
											: lasting === session.pageUrl
												? 'Keep page'
												: 'Keep player'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if nothing}
			<p class="note">
				Nothing was found to keep on that page. Press play on their player, long-press a picture, or
				select a passage, then tap the button again.
			</p>
		{/if}
		<LayoutPicker
			id="found-layout"
			creatorUrl={session.creator.url}
			declared={session.creator.layout}
		/>
		<div class="actions">
			<button class="primary" onclick={onback}>Back to their page</button>
			<button class="outward" onclick={ondone}>Done with this site</button>
			<button class="outward" onclick={() => openExternal(session.pageUrl)}>
				Open in your browser
			</button>
		</div>
	</div>
</Sheet>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 0 12px;
	}

	.note {
		margin: 0;
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.4;
	}

	.pick {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 16px;
	}

	.pick h3,
	.tracks-head {
		margin: 0;
		font-family: var(--display);
		font-size: 15px;
		font-weight: 650;
	}

	/* Loaded live from the creator's host, never stored; the WebView cache is cleared on close. */
	.picture {
		display: block;
		max-width: 100%;
		max-height: 40vh;
		margin: 0 auto;
		border-radius: 10px;
		object-fit: contain;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		font-size: 14px;
	}

	.kinds label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
	}

	.kinds input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--brand);
	}

	blockquote {
		margin: 0;
		padding: 2px 0 2px 12px;
		border-left: 3px solid var(--brand);
		font-size: 14.5px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.keep.wide {
		align-self: flex-start;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--surface);
	}

	/* A real button: 44px, and round like every play button in the app. */
	.icon.preview {
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
	}

	.icon.preview svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.guide-link {
		display: inline;
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: none;
		color: var(--brand-text);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
	}

	.text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		font-size: 14px;
	}

	.text b,
	.text small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.text small {
		color: var(--muted);
		font-size: 12px;
	}

	/* A reason, so it wraps rather than being cut. */
	.text small.refused {
		white-space: normal;
	}

	.keep,
	.outward {
		flex: none;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}

	.keep:not(:disabled) {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.primary {
		min-height: 44px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}
</style>
