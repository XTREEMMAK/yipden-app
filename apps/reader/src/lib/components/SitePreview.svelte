<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { duration, prefersReducedMotion } from '$lib/motion.js';
	import { hostOf } from '$lib/hosts.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';
	import { saveSite, siteLayout, visitSite } from '$lib/siteActions.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';
	import { categoryLabel, tagLabel } from '$lib/sites.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { toast } from '$lib/toast.svelte.js';
	import type { SiteEntry } from '$lib/sites/types.js';

	/**
	 * A site's whole preview, full screen: the page as a phone shows it, scrolling, where the card
	 * only shows its top. Opened from a card's picture; the card's own Visit stays one tap.
	 *
	 * Rendered by the panel, outside the card stack, for the reason `PartnerThumb.svelte` gives: a
	 * `position: fixed` box inside a transformed card is fixed to that card, not the screen.
	 */

	interface Props {
		entry: SiteEntry;
		onclose: () => void;
	}

	let { entry, onclose }: Props = $props();
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);
	let clipReady = $state(false);

	let desktopFirst = $derived(siteLayout(entry) === 'desktop-first');
	let onShelf = $derived(shelf.has(entry.url));
	/** Under reduced motion the still is the preview. */
	let moving = $derived(!!entry.preview_url && !prefersReducedMotion());
	let siteFeed = $derived(entry.feeds?.[0]);
	let siteFollowed = $derived(siteFeed !== undefined && siteFollows.isFollowing(entry.url));

	$effect(() => {
		closeButton?.focus();
	});

	onMount(() => {
		void siteFollows.load();
		return closeOnBack('yipdenSitePreview', () => onclose());
	});

	function visit() {
		onclose();
		visitSite(entry);
	}

	async function followSite() {
		if (!siteFeed) return;
		await siteFollows.follow({
			siteUrl: entry.url,
			feedUrl: siteFeed.url,
			title: entry.title
		});
		toast.show(`Following ${entry.title}. Its posts arrive in Yips.`);
	}

	function providerLabel(provider: string): string {
		return provider
			.split(/[-_]/)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}
</script>

<svelte:window onkeydown={(event) => (event.key === 'Escape' ? onclose() : null)} />

<div
	class="preview"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={`Preview of ${entry.title}`}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
>
	<button type="button" class="backdrop" tabindex="-1" aria-label="Close" onclick={onclose}
	></button>

	<div class="frame" style:background={entry.poster_url ? null : washFor(entry.id)}>
		{#if entry.poster_url}
			<img src={entry.poster_url} alt="" />
		{:else}
			<span class="no-poster" aria-hidden="true">{hostOf(entry.url)}</span>
		{/if}
		{#if moving}
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
	</div>

	<div class="caption">
		<h2>{entry.title}</h2>
		<p class="kind">{categoryLabel(entry.category)}</p>
		<p class="host">
			{hostOf(entry.url)}{entry.hosting
				? ` · Hosted on ${providerLabel(entry.hosting.provider)}`
				: ''}{desktopFirst ? ' · Best on desktop' : ''}
		</p>
		{#if entry.blurb}<p class="blurb">{entry.blurb}</p>{/if}
		{#if entry.makers?.length}
			<p class="makers">
				Made by
				{#each entry.makers as maker, index (maker.url)}
					{#if index > 0},
					{/if}<a href={`/creator?site=${encodeURIComponent(maker.url)}`}>{maker.name}</a>
				{/each}
			</p>
		{/if}
		{#if entry.tags.length}
			<p class="tags">{entry.tags.map(tagLabel).join(' · ')}</p>
		{/if}
		{#if entry.listing?.manage_url}
			<button class="manage" type="button" onclick={() => openExternal(entry.listing!.manage_url!)}>
				Is this your site? Claim, correct or remove this listing
			</button>
		{/if}
	</div>

	<div class="acts">
		{#if desktopFirst}
			<button class="primary" aria-pressed={onShelf} onclick={() => saveSite(entry)}>
				{onShelf ? 'Saved' : 'Save for later'}
			</button>
			<button class="secondary" onclick={visit}>Open</button>
		{:else}
			<button class="primary" onclick={visit}>Visit</button>
			<button class="secondary" aria-pressed={onShelf} onclick={() => saveSite(entry)}>
				{onShelf ? 'Saved' : 'Save'}
			</button>
		{/if}
		{#if siteFeed}
			{#if siteFollowed}
				<a class="secondary" href="/you/sites" aria-label={`Following ${entry.title}: manage`}
					>Following</a
				>
			{:else}
				<button class="secondary" onclick={followSite}>Follow site</button>
			{/if}
		{/if}
		<button bind:this={closeButton} class="secondary" onclick={onclose}>Close</button>
	</div>
</div>

<style>
	.preview {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: calc(16px + env(safe-area-inset-top, 0px)) 20px
			calc(16px + env(safe-area-inset-bottom, 0px));
		color: #fff;
		overflow-y: auto;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(10, 4, 2, 0.92);
	}

	.preview > :not(.backdrop) {
		position: relative;
	}

	/* The page at a phone's own shape, as large as the screen allows above its buttons. */
	.frame {
		flex: 1;
		min-height: 0;
		aspect-ratio: 390 / 844;
		max-width: 100%;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: 18px;
		background: #000;
	}

	.frame img,
	.frame video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
	}

	.frame video {
		opacity: 0;
		transition: opacity var(--dur-m) var(--ease);
	}

	.frame video.ready {
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
		overflow-wrap: anywhere;
	}

	.caption {
		align-self: stretch;
		text-align: center;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 22px;
		line-height: 1.1;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}

	.host {
		margin: 4px 0 0;
		color: rgba(255, 255, 255, 0.8);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.05em;
	}

	.kind,
	.blurb,
	.makers,
	.tags {
		margin: 6px auto 0;
		max-width: 560px;
	}

	.kind {
		font-size: 13px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.blurb {
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
		line-height: 1.45;
	}

	.makers,
	.tags {
		color: rgba(255, 255, 255, 0.78);
		font-size: 13px;
		line-height: 1.4;
	}

	.makers a {
		color: #fff;
		font-weight: 650;
	}

	.manage {
		min-height: 44px;
		margin-top: 8px;
		padding: 6px 12px;
		border: 0;
		background: none;
		color: rgba(255, 255, 255, 0.78);
		font: inherit;
		font-size: 13px;
		text-decoration: underline;
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}

	.primary,
	.secondary,
	a.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0 20px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
	}

	/* A fixed ink on white, as elsewhere on the always dark Discover. */
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

	@media (prefers-reduced-motion: reduce) {
		.frame video {
			transition: none;
		}
	}
</style>
