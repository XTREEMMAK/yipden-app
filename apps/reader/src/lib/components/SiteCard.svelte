<script lang="ts">
	import { hostOf } from '$lib/hosts.js';
	import { explored } from '$lib/explored.svelte.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { forums } from '$lib/forums.svelte.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';
	import { goto } from '$app/navigation';
	import { remoteThumb, saveSite, siteLayout, visitSite } from '$lib/siteActions.js';
	import { toast } from '$lib/toast.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import { celebrateLike } from '$lib/sound.js';
	import { washFor } from '$lib/ring.svelte.js';
	import { categoryLabel, tagLabel } from '$lib/sites.svelte.js';
	import type { SiteEntry } from '$lib/sites/types.js';

	/**
	 * One site in Surf: its poster first and always, its scroll clip only while it is the card the
	 * reader is looking at (`playing`, decided by the panel, at most one at a time).
	 *
	 * A site is a place, not a person: Visit, Save, Like and Not for me, and no profile. Who made it
	 * is never guessed here; that waits for the evidence rule (docs/sites-contract.md).
	 */

	interface Props {
		entry: SiteEntry;
		/** True only for the one card whose clip should run right now. */
		playing: boolean;
		/** The picture opens the site's whole preview; the panel draws it, outside the stack. */
		onpreview: (entry: SiteEntry) => void;
	}

	let { entry, playing, onpreview }: Props = $props();

	let desktopFirst = $derived(siteLayout(entry) === 'desktop-first');
	let onShelf = $derived(shelf.has(entry.url));
	let seen = $derived(explored.has(entry.url));
	let verdict = $derived(verdicts.verdictFor(entry.url));
	/** The video stays hidden over the poster until it is actually drawing frames. */
	let clipReady = $state(false);
	$effect(() => {
		if (!playing) clipReady = false;
	});

	/**
	 * A forum in the forum index: followed the way any forum is, through Follow's forum lookup
	 * (whole forum or chosen categories), when YipDen can read it. Only Discourse, today.
	 */
	let isForum = $derived(typeof entry.software === 'string');
	let followable = $derived(entry.software === 'discourse');
	let forumFollowed = $derived(
		followable && forums.follows.some((follow) => follow.forumUrl === entry.url.replace(/\/+$/, ''))
	);

	function followForum() {
		void goto(`/follow?mode=forums&url=${encodeURIComponent(entry.url)}`);
	}

	/** A site that lists a feed is followed by it, in one tap; one without cannot be, only saved. */
	let siteFeed = $derived(isForum ? undefined : entry.feeds?.[0]);
	let siteFollowed = $derived(siteFeed !== undefined && siteFollows.isFollowing(entry.url));

	async function followSite() {
		if (!siteFeed) return;
		await siteFollows.follow({
			siteUrl: entry.url,
			feedUrl: siteFeed.url,
			title: entry.title
		});
		toast.show(`Following ${entry.title}. Its posts arrive in Yips.`);
	}

	const visit = () => visitSite(entry);
	const save = () => saveSite(entry);

	async function decide(kind: 'liked' | 'hidden') {
		const now = await verdicts.toggle(
			{
				url: entry.url,
				name: entry.title,
				source: 'site',
				// A forum's like says so, so You's Follow takes it to Follow's Forums side.
				via: isForum ? 'Forums' : 'Surf',
				...(remoteThumb(entry) ? { thumbUrl: remoteThumb(entry)! } : {})
			},
			kind
		);
		if (now === 'liked') {
			celebrateLike();
			toast.show(`Liked ${entry.title}. Find it in You.`);
		} else if (now === 'hidden') toast.show(`${entry.title} hidden. Bring it back from You.`);
	}

	async function toggleSeen() {
		const now = await explored.toggle(entry.url);
		toast.show(now ? `${entry.title} marked explored.` : `${entry.title} unmarked.`);
	}
</script>

<article class="card yip-fold" class:seen data-site={entry.id}>
	<button
		class="media"
		onclick={() => onpreview(entry)}
		aria-label={`Preview ${entry.title}`}
		aria-haspopup="dialog"
		style:background={entry.poster_url ? null : washFor(entry.id)}
	>
		{#if entry.poster_url}
			<img src={entry.poster_url} alt="" loading="lazy" decoding="async" />
		{:else}
			<span class="no-poster" aria-hidden="true">{hostOf(entry.url)}</span>
		{/if}
		{#if playing && entry.preview_url}
			<!-- Muted, inline and looping: a glance at the page, never sound, never fullscreen. -->
			<video
				class:ready={clipReady}
				src={entry.preview_url}
				poster={entry.poster_url}
				muted
				loop
				playsinline
				autoplay
				preload="auto"
				disablepictureinpicture
				aria-hidden="true"
				onplaying={() => (clipReady = true)}
			></video>
		{/if}
		{#if entry.preview_url}
			<span class="moving" class:on={clipReady} aria-hidden="true">
				<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
			</span>
		{/if}
	</button>

	<div class="body">
		<div class="meta-row">
			<p class="meta">
				<span class="chip">{categoryLabel(entry.category)}</span>
				{#if desktopFirst}<span class="chip">Best on desktop</span>{/if}
			</p>
			<button
				class="seen-toggle"
				aria-label={seen ? `Unmark ${entry.title} as explored` : `Mark ${entry.title} as explored`}
				title={seen ? 'Explored' : 'Mark explored'}
				aria-pressed={seen}
				onclick={toggleSeen}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.3l2.6 2.6 5-5.4" /></svg
				>
			</button>
		</div>
		<h3>{entry.title}</h3>
		{#if entry.blurb}<p class="blurb">{entry.blurb}</p>{/if}
		<p class="host">{hostOf(entry.url)}</p>
		{#if isForum && !followable && entry.follow_note}
			<p class="follow-note">{entry.follow_note}</p>
		{/if}
		{#if entry.tags.length}
			<p class="tags">
				{#each entry.tags.slice(0, 3) as tag (tag)}
					<span>{tagLabel(tag)}</span>
				{/each}
			</p>
		{/if}

		<div class="acts">
			{#if desktopFirst}
				<button class="primary" aria-pressed={onShelf} onclick={save}>
					{onShelf ? 'Saved' : 'Save for later'}
				</button>
				<button class="secondary" onclick={visit} aria-label={`Open ${hostOf(entry.url)}`}>
					<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="12" r="9" />
						<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
					</svg>
					Open
				</button>
			{:else}
				<button class="primary" onclick={visit} aria-label={`Visit ${hostOf(entry.url)}`}>
					<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="12" r="9" />
						<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
					</svg>
					Visit
				</button>
				<button
					class="secondary icon-only"
					aria-label={`Save ${entry.title} for later`}
					title={onShelf ? 'Saved' : 'Save for later'}
					aria-pressed={onShelf}
					onclick={save}
				>
					<svg class="glyph" class:filled={onShelf} viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 4h12v16l-6-4-6 4z" />
					</svg>
				</button>
			{/if}
			{#if followable}
				{#if forumFollowed}
					<a class="secondary" href="/you/forums" aria-label={`Following ${entry.title}: manage`}
						>Following</a
					>
				{:else}
					<button class="secondary" onclick={followForum} aria-label={`Follow ${entry.title}`}>
						<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"
							><path d="M12 5v14M5 12h14" /></svg
						>
						Follow
					</button>
				{/if}
			{/if}
			{#if siteFeed}
				{#if siteFollowed}
					<a class="secondary" href="/you/sites" aria-label={`Following ${entry.title}: manage`}
						>Following</a
					>
				{:else}
					<button class="secondary" onclick={followSite} aria-label={`Follow ${entry.title}`}>
						<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"
							><path d="M12 5v14M5 12h14" /></svg
						>
						Follow
					</button>
				{/if}
			{/if}
			<button
				class="secondary icon-only"
				aria-label={`Like ${entry.title}`}
				title="Like"
				aria-pressed={verdict === 'liked'}
				onclick={() => decide('liked')}
			>
				<svg
					class="glyph"
					class:filled={verdict === 'liked'}
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
				</svg>
			</button>
			<button
				class="secondary icon-only"
				aria-label={`Not for me: ${entry.title}`}
				title="Not for me"
				onclick={() => decide('hidden')}
			>
				<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
					<path d="M9.6 8.6l4.8 4.8M14.4 8.6l-4.8 4.8" />
				</svg>
			</button>
		</div>
	</div>
</article>

<style>
	/*
	 * The partner ring card's look (PartnerRingPanel.svelte), opaque for the same reason: the
	 * stack overlaps a receding card with the next, and a see-through one shows through. No
	 * `position` on `.card`: under the stack this box is the sticky one (styles/card-stack.css).
	 */
	.card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: var(--r-card);
		background: color-mix(in srgb, #fff 7%, var(--deep));
		color: #fff;
	}

	/*
	 * The top of the page as a phone shows it: a fixed shape reserved before anything loads, so a
	 * card never grows mid-scroll (the judder DECISIONS.md records for partner thumbnails).
	 */
	.media {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		padding: 0;
		border: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.16);
		background: #000;
		overflow: hidden;
	}

	.media img,
	.media video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
	}

	.media video {
		opacity: 0;
		transition: opacity var(--dur-m) var(--ease);
	}

	.media video.ready {
		opacity: 1;
	}

	.no-poster {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 0 20px;
		font-family: var(--display);
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}

	/* Says a card moves, before and while it does: dim until its clip is drawing. */
	.moving {
		position: absolute;
		right: 10px;
		bottom: 10px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		opacity: 0.7;
	}

	.moving.on {
		opacity: 0;
		transition: opacity var(--dur-m) var(--ease);
	}

	.moving svg {
		width: 14px;
		height: 14px;
		fill: #fff;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 18px 16px;
	}

	.meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: -6px -10px -6px 0;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
	}

	.chip {
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 999px;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-family: var(--display);
		font-size: 24px;
		line-height: 1.05;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}

	.blurb {
		display: -webkit-box;
		overflow: hidden;
		margin: 0;
		color: rgba(255, 255, 255, 0.9);
		font-size: 15px;
		line-height: 1.45;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	.host {
		margin: 0;
		color: rgba(255, 255, 255, 0.82);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.05em;
	}

	/* Why a forum has no Follow: said plainly, not left for the reader to wonder. */
	.follow-note {
		margin: 0;
		color: rgba(255, 255, 255, 0.75);
		font-size: 13px;
		line-height: 1.4;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
	}

	.tags span {
		padding: 3px 8px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		font-size: 12px;
	}

	/* Looked at already: quieter, never hidden unless the reader asks. */
	.card.seen .body > :not(.acts):not(.meta-row),
	.card.seen .media {
		opacity: 0.62;
	}

	.seen-toggle {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: rgba(255, 255, 255, 0.55);
	}

	.seen-toggle svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.seen-toggle[aria-pressed='true'] {
		color: #fff;
	}

	.seen-toggle[aria-pressed='true'] svg {
		fill: var(--brand);
		stroke: #fff;
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}

	a.secondary {
		text-decoration: none;
	}

	.primary,
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 48px;
		padding: 0 15px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
	}

	/* A fixed ink on white, as elsewhere on the always dark Discover. See DECISIONS.md. */
	.primary {
		background: #fff;
		color: #1f1410;
	}

	.primary[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.22);
		color: #fff;
	}

	.secondary {
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
	}

	.secondary[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.3);
	}

	.icon-only {
		width: 50px;
		padding: 0;
	}

	.glyph {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.icon-only .glyph {
		width: 32px;
		height: 32px;
		stroke-width: 1.7;
	}

	.glyph.filled {
		fill: currentColor;
	}
</style>
