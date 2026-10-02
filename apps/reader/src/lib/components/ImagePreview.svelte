<script lang="ts">
	import { onMount } from 'svelte';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { fade } from 'svelte/transition';
	import { duration, prefersReducedMotion } from '$lib/motion.js';

	/**
	 * One image, full screen: what a thumbnail badge opens into when it turns out to actually be
	 * a real picture rather than a small button graphic. Deliberately not `PreviewSheet`, which
	 * pages through several slides for a member's own preview content; this shows exactly one
	 * image a reader tapped to see larger, dismissed the same way every other overlay here is
	 * (its own close button, Escape, or a tap on the backdrop).
	 */

	interface Props {
		src: string;
		alt: string;
		onclose: () => void;
	}

	let { src, alt, onclose }: Props = $props();
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);

	$effect(() => {
		closeButton?.focus();
	});

	// Phone Back closes this first, rather than leaving the screen underneath it.
	onMount(() => closeOnBack('yipdenImage', () => onclose()));
</script>

<svelte:window onkeydown={(event) => (event.key === 'Escape' ? onclose() : null)} />

<button
	type="button"
	class="backdrop"
	data-noswipe
	tabindex="-1"
	aria-label="Close"
	onclick={onclose}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
></button>

<div
	class="frame"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={alt || 'Image preview'}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
>
	<img {src} {alt} referrerpolicy="no-referrer" />
	<button bind:this={closeButton} class="close" onclick={onclose} aria-label="Close preview">
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
	</button>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(8, 3, 1, 0.86);
		cursor: default;
	}

	.frame {
		position: fixed;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		padding: calc(20px + env(safe-area-inset-top, 0px)) 20px
			calc(20px + env(safe-area-inset-bottom, 0px));
		pointer-events: none;
	}

	.frame img {
		max-width: 100%;
		max-height: 100%;
		border-radius: 12px;
		object-fit: contain;
		pointer-events: auto;
	}

	.close {
		position: absolute;
		top: calc(16px + env(safe-area-inset-top, 0px));
		right: 16px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
		pointer-events: auto;
	}

	.close svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
