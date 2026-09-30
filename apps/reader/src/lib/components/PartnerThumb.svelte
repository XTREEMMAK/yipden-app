<script lang="ts">
	import { isPreviewable } from './partnerThumb.js';

	/**
	 * A partner ring member's own badge image, wherever one was found: everything from a classic
	 * 88×31 webring button (Musicians Webring) to real cover art (Knifebeetle, 300×300). What a
	 * ring actually publishes is never declared anywhere, so this decides per image, after it
	 * loads, rather than trusting anything the scraper could have guessed from a URL alone.
	 *
	 * A button graphic is shown at its own size and left alone: blowing up an 88×31 pixel-art
	 * banner to fill a screen only shows the same handful of pixels bigger. Real art past
	 * `PREVIEWABLE_MIN` on both sides becomes tappable.
	 *
	 * Opening the actual preview is the caller's job, not this component's: `ImagePreview` is
	 * `position: fixed`, and a card here sits inside `cardStack`'s own `.yip-stack`, which the
	 * stack action moves with a CSS `transform` every frame it is not fully at rest. A `position:
	 * fixed` descendant of a transformed ancestor is fixed to *that ancestor's* box, not the
	 * viewport, per the CSS spec — rendering the preview from inside a card locked it to that
	 * card's own bounds instead of the screen. The caller renders `ImagePreview` itself, outside
	 * the stack entirely, and this only reports when tapping should open one.
	 */

	interface Props {
		src: string;
		alt: string;
		onpreview: () => void;
	}

	let { src, alt, onpreview }: Props = $props();

	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	let previewable = $derived(isPreviewable(naturalWidth, naturalHeight));

	function onload(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		naturalWidth = img.naturalWidth;
		naturalHeight = img.naturalHeight;
	}
</script>

<button
	type="button"
	class="thumb-btn"
	disabled={!previewable}
	aria-label={previewable ? `View ${alt} larger` : undefined}
	onclick={onpreview}
>
	<img
		class="thumb"
		{src}
		alt=""
		aria-hidden="true"
		loading="lazy"
		referrerpolicy="no-referrer"
		{onload}
	/>
	{#if previewable}
		<span class="zoom" aria-hidden="true">
			<svg viewBox="0 0 24 24"
				><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.35-4.35" /></svg
			>
		</span>
	{/if}
</button>

<style>
	.thumb-btn {
		position: relative;
		flex: 0 0 auto;
		display: block;
		padding: 0;
		border: 0;
		background: none;
		line-height: 0;
	}

	.thumb-btn:disabled {
		cursor: default;
	}

	/*
	 * A small badge, not a hero image: what a ring actually publishes here varies wildly, from a
	 * classic 88x31 webring button (a banner, not a portrait) to real cover art, and this has to
	 * read sensibly as either. Bounded, not forced square: a banner shows at its true, crisp size
	 * within these limits rather than being stretched or letterboxed into a shape it never had.
	 */
	.thumb {
		display: block;
		max-width: 96px;
		max-height: 64px;
		width: auto;
		height: auto;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		object-fit: contain;
	}

	.zoom {
		position: absolute;
		right: 3px;
		bottom: 3px;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: rgba(8, 3, 1, 0.72);
		color: #fff;
	}

	.zoom svg {
		width: 12px;
		height: 12px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
