<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import type { Slide } from '$lib/preview.js';

	/**
	 * A member's preview, paged through: comic pages, artworks or text excerpts. Rendered over
	 * Discover as a dialog, dismissed by its close button, Escape, or a tap outside it, with focus
	 * moved in on open and handed back to whatever opened it by the parent.
	 *
	 * Slides are a native scroll-snap strip rather than a script-driven carousel, so a swipe here
	 * is the browser's own horizontal scroll and never competes with Discover's swipe (the whole
	 * sheet is `data-noswipe`), and the counter reads the strip's own scroll position.
	 */

	interface Props {
		title: string;
		slides: Slide[];
		onclose: () => void;
	}

	let { title, slides, onclose }: Props = $props();

	let strip = $state<HTMLElement | undefined>(undefined);
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);
	let at = $state(0);

	$effect(() => {
		closeButton?.focus();
	});

	function onScroll() {
		if (strip) at = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
	}

	function go(index: number) {
		strip?.scrollTo({
			left: index * (strip?.clientWidth ?? 0),
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onclose();
		else if (event.key === 'ArrowRight') go(Math.min(slides.length - 1, at + 1));
		else if (event.key === 'ArrowLeft') go(Math.max(0, at - 1));
	}}
/>

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
	class="sheet"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={`${title}, preview`}
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="head">
		<div>
			<h2>{title}</h2>
			{#if slides.length > 1}<small>{at + 1} / {slides.length}</small>{/if}
		</div>
		<button bind:this={closeButton} class="close" onclick={onclose} aria-label="Close preview">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>

	<div class="strip" bind:this={strip} onscroll={onScroll}>
		{#each slides as slide, index (index)}
			<figure class="slide" aria-label={`${index + 1} of ${slides.length}`}>
				{#if slide.image}
					<img
						src={slide.image}
						alt={slide.alt ?? ''}
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
				{:else}
					<div class="text">
						{#if slide.title}<h3>{slide.title}</h3>{/if}
						<p>{slide.text}</p>
					</div>
				{/if}
				{#if slide.caption}<figcaption>{slide.caption}</figcaption>{/if}
			</figure>
		{/each}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(15, 6, 2, 0.6);
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
		height: min(80vh, 720px);
		padding: 18px 0 calc(16px + env(safe-area-inset-bottom, 0px));
		border-radius: 24px 24px 0 0;
		background: var(--ground);
		color: var(--ink);
		box-shadow: 0 -12px 30px -10px rgba(0, 0, 0, 0.3);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 20px 12px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 650;
	}

	small {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted);
	}

	.close {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.strip {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		overscroll-behavior-x: contain;
	}

	.strip::-webkit-scrollbar {
		display: none;
	}

	.slide {
		flex: 0 0 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 0;
		margin: 0;
		padding: 0 20px;
		scroll-snap-align: center;
	}

	img {
		max-width: 100%;
		min-height: 0;
		flex: 1;
		object-fit: contain;
		border-radius: 12px;
	}

	.text {
		max-height: 100%;
		overflow-y: auto;
		text-align: left;
	}

	.text h3 {
		margin: 0 0 8px;
		font-size: 18px;
	}

	.text p {
		margin: 0;
		font-size: 16px;
		line-height: 1.55;
		white-space: pre-wrap;
	}

	figcaption {
		font-size: 13px;
		color: var(--muted);
		text-align: center;
	}
</style>
