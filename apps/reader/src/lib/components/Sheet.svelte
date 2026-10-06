<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';

	/**
	 * A bottom sheet: a dimmed backdrop, a panel rising from the bottom with a title and a close
	 * button, closed by the backdrop, the button, Escape or Android Back (`closeOnBack`). The one
	 * frame every standalone sheet shares; what is inside is the caller's.
	 */

	interface Props {
		/** The heading shown, and the dialog's name unless `label` says otherwise. */
		title: string;
		label?: string;
		onclose: () => void;
		/** This sheet's own history entry, so Back closes it and nothing under it. */
		historyKey: string;
		closeLabel?: string;
		maxHeight?: string;
		/** Extra classes for the panel, for a caller's own layout. */
		class?: string;
		children: Snippet;
	}

	let {
		title,
		label,
		onclose,
		historyKey,
		closeLabel = 'Close',
		maxHeight = '75vh',
		class: panelClass = '',
		children
	}: Props = $props();

	let closeButton = $state<HTMLButtonElement | undefined>(undefined);

	onMount(() => {
		closeButton?.focus();
		return closeOnBack(historyKey, onclose);
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
	aria-label={closeLabel}
	onclick={onclose}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
></button>
<div
	class="sheet {panelClass}"
	style:max-height={maxHeight}
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={label ?? title}
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="sheet-head">
		<h2>{title}</h2>
		<button bind:this={closeButton} class="sheet-close" onclick={onclose} aria-label={closeLabel}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>
	{@render children()}
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

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 35;
		display: flex;
		flex-direction: column;
		gap: 4px;
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
		overflow-wrap: anywhere;
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
</style>
