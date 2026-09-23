<script lang="ts">
	import type { RingFocalPoint } from '@yipden/ring-client';
	import { onDestroy, onMount } from 'svelte';
	import { player } from '$lib/player.svelte.js';
	import { prefersReducedMotion } from '$lib/motion.js';
	import { createHeroGL, type HeroGLHandle } from '$lib/webgl/heroGL.js';

	/**
	 * The full bleed image behind a ring member.
	 *
	 * Two layers that crossfade, so a new member's image arrives over the old one instead of
	 * replacing it in a blink. The image is decoration, never content: it carries no meaning the
	 * text does not, so it is a background rather than an `img` and is hidden from assistive
	 * technology entirely.
	 *
	 * The brief allows a WebGL displacement wipe here as an optional upgrade over this crossfade,
	 * and this is both: the crossfade above never stops running, and a canvas drawn over it takes
	 * over visually whenever `createHeroGL` manages to stand one up. Every way that can fail, no
	 * WebGL, a shader that will not compile, a photo host with no CORS headers, a lost context
	 * mid-session, leaves the crossfade as what the reader actually sees, which is why it keeps
	 * running underneath rather than being skipped while the canvas is active.
	 */

	interface Props {
		src: string | null;
		/** Drawn when a member has no image at all, derived from their id so it is stable. */
		wash: string;
		focal?: RingFocalPoint | undefined;
		/** Which way the wipe should travel for the next `src` change: -1/1 for a swipe or the
		 * prev/next buttons, 0 for a plain crossfade (shuffle, a filter change). */
		direction?: -1 | 0 | 1;
	}

	let { src, wash, focal, direction = 0 }: Props = $props();

	/** The layer currently on top, and the one underneath it fading out. */
	let layers = $state<Array<{ id: number; src: string | null; focal: RingFocalPoint }>>([]);
	let nextId = 0;
	let lastSrc: string | null | undefined;

	let canvas: HTMLCanvasElement | undefined;
	let gl: HeroGLHandle | null = null;
	let glActive = $state(false);
	let glShowing = $derived(glActive && src !== null);

	onMount(() => {
		if (canvas) {
			gl = createHeroGL(
				canvas,
				() => (prefersReducedMotion() ? 0 : 1),
				() => (glActive = false)
			);
		}
		glActive = gl !== null;
		if (gl && src) gl.set(src);

		const onVisibility = () => gl?.setLive(!document.hidden);
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => gl?.destroy());

	/*
	 * No ambient drift under the full screen player: Discover sits behind it but the canvas
	 * would otherwise keep animating, spending battery on frames nobody can see. Off Discover
	 * entirely is already covered without any code here, since SvelteKit unmounts this component
	 * (destroying `gl` with it) the moment the reader leaves the tab.
	 */
	$effect(() => {
		gl?.setLive(player.sheet !== 'full');
	});

	$effect(() => {
		const position = focal ?? { x: 50, y: 50 };
		if (src === lastSrc) return;
		lastSrc = src;

		layers = [...layers.slice(-1), { id: nextId++, src, focal: position }];

		if (gl && src) {
			if (direction === 0) gl.set(src);
			else gl.go(src, direction, 0);
		}
	});

	/** Called during a swipe's live drag, as a fraction of the viewport width. */
	export function dragPreview(fraction: number): void {
		gl?.drag(fraction);
	}

	/** Called when a swipe ends without committing, so the live preview springs back to rest. */
	export function releasePreview(): void {
		gl?.release();
	}

	/** Wakes the ambient loop; call on whatever gesture would start a drag. */
	export function wake(): void {
		gl?.kick();
	}
</script>

<div class="art" class:gl-showing={glShowing} style:background-image={wash} aria-hidden="true">
	{#each layers as layer (layer.id)}
		<div
			class="layer"
			style:background-image={layer.src ? `url(${CSS.escape(layer.src)})` : 'none'}
			style:background-position="{layer.focal.x}% {layer.focal.y}%"
		></div>
	{/each}
</div>
<canvas bind:this={canvas} class="gl" class:active={glShowing} aria-hidden="true"></canvas>

<style>
	.art {
		position: absolute;
		/* Slightly oversized so a focal point near an edge still fills the frame. */
		inset: -2%;
		background-size: cover;
		background-position: center;
	}

	.art.gl-showing {
		visibility: hidden;
	}

	.layer {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-repeat: no-repeat;
		animation: hero-in var(--dur-xl) var(--ease) both;
	}

	.gl {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: none;
	}

	.gl.active {
		display: block;
	}

	@keyframes hero-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/*
	 * Under reduced motion the crossfade shortens rather than disappearing: the image still has
	 * to change, and a hard cut between two full bleed photographs is more jarring, not less.
	 */
	@media (prefers-reduced-motion: reduce) {
		.layer {
			animation-duration: var(--dur-s);
		}
	}
</style>
