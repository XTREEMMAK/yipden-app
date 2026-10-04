<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { type PreviewKind } from '@yipden/ring-client';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { explored } from '$lib/explored.svelte.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import { openExternal } from '$lib/platform/external.js';
	import type { SiteSession } from '$lib/platform/siteBrowser.svelte.js';
	import { titleFromUrl } from '$lib/readerTracks.js';
	import { toast } from '$lib/toast.svelte.js';
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
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);

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

	let added = $derived(
		new Set(creatorNotes.tracksFor(session.creator.url).map((track) => track.url))
	);

	onMount(() => {
		void creatorNotes.load();
		void explored.mark(session.creator.url);
		closeButton?.focus();
		return closeOnBack('foundOnPage', onclose);
	});

	function titleOf(item: SiteSession['found'][number]): string {
		if (item.title) return item.title;
		const platform = PLATFORM[item.kind];
		return platform ? `${platform} player` : titleFromUrl(item.url);
	}

	async function keep(item: SiteSession['found'][number]) {
		const result = await creatorNotes.addTrack(session.creator.url, {
			url: item.url,
			title: titleOf(item),
			foundOn: session.pageUrl
		});
		if (result === 'added') toast.show(`Added to ${session.creator.name}, on this phone only.`);
		else if (result === 'full') toast.show('That is as many tracks as one creator can have here.');
		else if (result === 'unsafe') toast.show('That one cannot be used.');
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onclose();
	}}
/>

<button
	type="button"
	class="sheet-backdrop"
	data-noswipe
	tabindex="-1"
	aria-label="Close"
	onclick={onclose}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
></button>
<div
	class="found-sheet"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={`Found on ${session.creator.name}'s page`}
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="sheet-head">
		<h2>Found on {session.creator.name}'s page</h2>
		<button
			bind:this={closeButton}
			class="sheet-close"
			onclick={onclose}
			aria-label="Back to their page"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>
	<div class="body">
		{#if session.found.length}
			<p class="note">
				Keep a track to play it here later. Only its link is saved, on this phone, labelled as added
				by you.
			</p>
			<ul class="list">
				{#each session.found as item (item.url)}
					{@const kept = added.has(item.url)}
					<li class="item">
						<span class="icon"><PlatformIcon kind={item.kind} /></span>
						<span class="text">
							<b>{titleOf(item)}</b>
							<small
								>{HOW_LABELS[item.how]} · {new URL(item.url).hostname.replace(/^www\./, '')}</small
							>
						</span>
						<button
							class="keep"
							aria-pressed={kept}
							disabled={kept}
							aria-label={kept ? `${titleOf(item)} kept` : `Keep ${titleOf(item)}`}
							onclick={() => keep(item)}
						>
							{kept ? 'Kept' : 'Keep'}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="note">
				No audio was found on that page. Press play on their player first, then tap the button
				again.
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
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(15, 6, 2, 0.5);
		cursor: default;
	}

	.found-sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 35;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 80vh;
		padding: 18px 8px calc(20px + env(safe-area-inset-bottom, 0px));
		border-radius: 24px 24px 0 0;
		background: var(--ground);
		color: var(--ink);
		box-shadow: 0 -12px 30px -10px rgba(0, 0, 0, 0.3);
		overflow-y: auto;
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 12px 10px;
	}

	.sheet-head h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 650;
	}

	.sheet-close {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.sheet-close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

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
