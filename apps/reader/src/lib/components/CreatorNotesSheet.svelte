<script lang="ts">
	import type { RingOrigin } from '$lib/references/types.js';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import type { SiteLayout } from '@yipden/ring-client';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import LayoutPicker from './LayoutPicker.svelte';
	import ReaderFinds from './ReaderFinds.svelte';
	import ReaderTracks from './ReaderTracks.svelte';

	/**
	 * A reader's own notes on one creator, from Discover or a partner ring: how their site reads,
	 * and tracks the reader added. Everything here stays on this phone.
	 */

	interface Props {
		creator: { url: string; name: string; artUrl?: string | null; ring?: RingOrigin | null };
		declared: SiteLayout | undefined;
		onclose: () => void;
	}

	let { creator, declared, onclose }: Props = $props();
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);

	onMount(() => {
		void creatorNotes.load();
		closeButton?.focus();
		return closeOnBack('creatorNotes', onclose);
	});
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
	class="notes-sheet"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={`Your notes on ${creator.name}`}
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="sheet-head">
		<h2>Your notes on {creator.name}</h2>
		<button bind:this={closeButton} class="sheet-close" onclick={onclose} aria-label="Close">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>
	<div class="body">
		<LayoutPicker id="notes-layout" creatorUrl={creator.url} {declared} />
		<ReaderTracks {creator} id="notes-tracks" onplay={onclose} />
		<ReaderFinds {creator} onopen={onclose} />
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

	.notes-sheet {
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
		gap: 16px;
		padding: 0 12px;
	}
</style>
