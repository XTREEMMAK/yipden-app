<script lang="ts">
	import type { RingFocalPoint } from '@yipden/ring-client';
	import { onDestroy } from 'svelte';
	import { player } from '$lib/player.svelte.js';

	/**
	 * The full bleed image behind a ring member.
	 *
	 * Ready covers use two layers to crossfade. If the incoming cover is still loading, the outgoing
	 * creator's art is removed immediately and the incoming creator's own wash is shown until its
	 * cover can be drawn. The image is decoration, never content: it carries no meaning the text does
	 * not, so it is a background rather than an `img` and is hidden from assistive technology.
	 *
	 * At rest the photo drifts very slowly around its frame, a different route for each slide, so an
	 * idle Discover is never a frozen picture. It is a transform only, so it costs the compositor
	 * and nothing else, and it holds still under the full player and for reduced motion.
	 * (A WebGL displacement wipe used to live here; see DECISIONS.md for why it was removed.)
	 */

	interface Props {
		src: string | null;
		/** Drawn when a member has no image at all, derived from their id so it is stable. */
		wash: string;
		focal?: RingFocalPoint | undefined;
		/** Photos likely to be shown next (the neighbours), fetched ahead so they appear at once. */
		preload?: Array<{ url: string; focal?: RingFocalPoint | undefined }>;
	}

	let { src, wash, focal, preload = [] }: Props = $props();

	/** No drift under the full screen player: Discover sits behind it and nobody can see it. */
	let paused = $derived(player.sheet === 'full');

	/** The layer currently on top, and the one underneath it fading out. */
	let layers = $state<
		Array<{ id: number; src: string | null; focal: RingFocalPoint; fade: boolean }>
	>([]);
	let nextId = 0;
	let lastIdentity: string | undefined;
	let sourceGeneration = 0;
	let destroyed = false;
	const cssReady = new Set<string>();
	const cssLoads = new Map<string, Promise<boolean>>();

	/**
	 * CSS backgrounds do not expose a load event. Loading the same URL through an Image first lets
	 * us keep an outgoing creator's cover out of the incoming creator's card, then reveal the new
	 * cover as soon as it is actually drawable. Browsers coalesce this with the background request.
	 */
	function loadCssPhoto(url: string): Promise<boolean> {
		if (cssReady.has(url)) return Promise.resolve(true);
		const pending = cssLoads.get(url);
		if (pending) return pending;
		if (typeof Image === 'undefined') return Promise.resolve(false);

		const task = new Promise<boolean>((resolve) => {
			const image = new Image();
			const finish = (loaded: boolean) => {
				image.onload = null;
				image.onerror = null;
				if (loaded) cssReady.add(url);
				else cssLoads.delete(url);
				resolve(loaded);
			};
			image.onload = () => finish(true);
			image.onerror = () => finish(false);
			image.src = url;
		});
		cssLoads.set(url, task);
		return task;
	}

	$effect(() => {
		const items = preload;
		for (const item of items) void loadCssPhoto(item.url);
	});

	$effect(() => {
		const position = focal ?? { x: 50, y: 50 };
		const identity = JSON.stringify([src, wash, position.x, position.y]);
		if (identity === lastIdentity) return;
		const firstSource = lastIdentity === undefined;
		lastIdentity = identity;
		const generation = ++sourceGeneration;

		if (!src) {
			layers = [];
		} else if (cssReady.has(src)) {
			// Keep the outgoing layer only when the incoming cover is already drawable. That preserves
			// the smooth crossfade without ever pairing old art with new creator metadata.
			layers = [
				...layers.slice(-1),
				{ id: nextId++, src, focal: position, fade: layers.length > 0 }
			];
		} else {
			// The wash belongs to the new creator. Remove the outgoing photo immediately while this
			// creator's cover loads, then reveal it only if this is still the active request.
			layers = [];
			void loadCssPhoto(src).then((loaded) => {
				if (!loaded || destroyed || generation !== sourceGeneration) return;
				layers = [{ id: nextId++, src, focal: position, fade: !firstSource }];
			});
		}
	});

	onDestroy(() => {
		destroyed = true;
	});
</script>

<div class="art" style:background-image={wash} aria-hidden="true">
	{#each layers as layer (layer.id)}
		<div
			class="layer"
			class:fade={layer.fade}
			class:paused
			style:--drift="drift-{layer.id % 4}"
			style:background-image={layer.src ? `url(${CSS.escape(layer.src)})` : 'none'}
			style:background-position="{layer.focal.x}% {layer.focal.y}%"
		></div>
	{/each}
</div>

<style>
	.art {
		position: absolute;
		/* Slightly oversized so a focal point near an edge still fills the frame. */
		inset: -2%;
		background-size: cover;
		background-position: center;
		overflow: hidden;
	}

	.layer {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-repeat: no-repeat;
		/* Scaled past the frame so drifting toward a corner never shows an edge. */
		animation: var(--drift) 48s ease-in-out infinite;
		will-change: transform;
	}

	.layer.fade {
		animation:
			hero-in var(--dur-xl) var(--ease) both,
			var(--drift) 48s ease-in-out infinite;
	}

	.layer.paused {
		animation-play-state: paused;
	}

	@keyframes hero-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Four loops through the same four corners, each starting somewhere else. */
	@keyframes drift-0 {
		0%,
		100% {
			transform: scale(1.1) translate(-2.5%, -2.5%);
		}
		25% {
			transform: scale(1.1) translate(2.5%, -1.5%);
		}
		50% {
			transform: scale(1.1) translate(2.5%, 2.5%);
		}
		75% {
			transform: scale(1.1) translate(-2%, 1.5%);
		}
	}

	@keyframes drift-1 {
		0%,
		100% {
			transform: scale(1.1) translate(2.5%, -2%);
		}
		25% {
			transform: scale(1.1) translate(2%, 2.5%);
		}
		50% {
			transform: scale(1.1) translate(-2.5%, 1.5%);
		}
		75% {
			transform: scale(1.1) translate(-1.5%, -2.5%);
		}
	}

	@keyframes drift-2 {
		0%,
		100% {
			transform: scale(1.1) translate(2.5%, 2.5%);
		}
		25% {
			transform: scale(1.1) translate(-2%, 2%);
		}
		50% {
			transform: scale(1.1) translate(-2.5%, -2.5%);
		}
		75% {
			transform: scale(1.1) translate(1.5%, -2%);
		}
	}

	@keyframes drift-3 {
		0%,
		100% {
			transform: scale(1.1) translate(-2.5%, 2%);
		}
		25% {
			transform: scale(1.1) translate(-1.5%, -2.5%);
		}
		50% {
			transform: scale(1.1) translate(2.5%, -2%);
		}
		75% {
			transform: scale(1.1) translate(2%, 2.5%);
		}
	}

	/*
	 * Under reduced motion the photo holds still and the crossfade shortens rather than
	 * disappearing: the image still has to change, and a hard cut between two full bleed
	 * photographs is more jarring, not less.
	 */
	@media (prefers-reduced-motion: reduce) {
		.layer,
		.layer.fade {
			animation: none;
		}

		.layer.fade {
			animation: hero-in var(--dur-s) var(--ease) both;
		}
	}
</style>
