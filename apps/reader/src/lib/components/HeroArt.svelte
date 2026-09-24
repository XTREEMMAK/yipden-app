<script lang="ts">
	import type { RingFocalPoint } from '@yipden/ring-client';
	import { onDestroy, onMount } from 'svelte';
	import { player } from '$lib/player.svelte.js';
	import { prefersReducedMotion } from '$lib/motion.js';
	import { loadDataUrlNative } from '$lib/platform/image.js';
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
	 * over visually whenever `createHeroGL` manages to stand one up. No WebGL context, a shader
	 * that will not compile, a lost context mid-session, all leave the crossfade as what the
	 * reader actually sees, which is why it keeps running underneath rather than being skipped
	 * while the canvas is active. A photo the canvas cannot read (in a browser, most of them: most
	 * personal sites send no CORS headers) is not a failure of the hero either, but it is shown
	 * by that CSS layer, never by a flat stand-in on the canvas. On Android the photo's bytes come
	 * through the native HTTP client (see platform/image.ts), which is why the wipe works there.
	 */

	interface Props {
		src: string | null;
		/** Drawn when a member has no image at all, derived from their id so it is stable. */
		wash: string;
		/** The same wash, as RGB bytes: what the WebGL hero paints if `src` never loads. */
		washColor: [number, number, number];
		focal?: RingFocalPoint | undefined;
		/** Which way the wipe should travel for the next `src` change: -1/1 for a swipe or the
		 * prev/next buttons, 0 for a plain crossfade (shuffle, a filter change). Follows this
		 * app's own convention (the same edge a left drag reveals), not the shader's. */
		direction?: -1 | 0 | 1;
		/** How far a committed swipe had already dragged, as a fraction of viewport width, so the
		 * wipe continues from the live preview instead of restarting from zero bend. */
		dragFraction?: number;
		/** Photos likely to be wiped to next (the neighbours), fetched ahead so the wipe has real
		 *  pixels to draw instead of finishing before the photo arrives. */
		preload?: string[];
	}

	let {
		src,
		wash,
		washColor,
		focal,
		direction = 0,
		dragFraction = 0,
		preload = []
	}: Props = $props();

	/** The layer currently on top, and the one underneath it fading out. */
	let layers = $state<
		Array<{ id: number; src: string | null; focal: RingFocalPoint; fade: boolean }>
	>([]);
	let nextId = 0;
	let lastSrc: string | null | undefined;

	let canvas: HTMLCanvasElement | undefined;
	let gl: HeroGLHandle | null = null;
	let glActive = $state(false);
	/** Photos the canvas holds as real pixels. Any other photo is shown by the CSS layer, which
	 *  needs no CORS, rather than the canvas painting a flat stand-in over it. */
	let drawable = $state<Set<string>>(new Set());
	let glShowing = $derived(glActive && src !== null && drawable.has(src));

	/**
	 * Standing up the canvas compiles a shader and creates a GL context, which is the heaviest
	 * thing Discover does on arrival. Done inside mount it lands in the middle of the screen
	 * change, ahead of the slide, and on a phone that is a visible pause between tapping the tab
	 * and anything moving. The CSS layer already shows the photo, so the canvas can wait until
	 * the first frame has painted; it takes over once it is ready and holds the photo.
	 */
	function startGL() {
		if (!canvas || gl) return;
		gl = createHeroGL(
			canvas,
			() => (prefersReducedMotion() ? 0 : 1),
			() => (glActive = false),
			{
				onTexture: (url, loaded) => {
					if (loaded) drawable = new Set(drawable).add(url);
				},
				...(loadDataUrlNative ? { loadDataUrl: loadDataUrlNative } : {})
			}
		);
		glActive = gl !== null;
		if (!gl) return;
		gl.setLive(player.sheet !== 'full' && !document.hidden);
		if (src) gl.set(src, washColor);
		for (const url of preload) gl.preload(url, washColor);
	}

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const frame = requestAnimationFrame(() => {
			timer = setTimeout(startGL, 0);
		});

		const onVisibility = () => gl?.setLive(!document.hidden);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	onDestroy(() => gl?.destroy());

	/*
	 * No ambient drift under the full screen player: Discover sits behind it but the canvas
	 * would otherwise keep animating, spending battery on frames nobody can see. Off Discover
	 * entirely is already covered without any code here, since SvelteKit unmounts this component
	 * (destroying `gl` with it) the moment the reader leaves the tab.
	 */
	$effect(() => {
		// Read first, for the same reason as the preload effect below: `gl?.` would skip evaluating
		// its argument while the canvas is not up yet, leaving this effect subscribed to nothing.
		const live = player.sheet !== 'full';
		gl?.setLive(live);
	});

	$effect(() => {
		// Read before the early return: an effect that returns first subscribes to nothing, and
		// this one must re-run when the neighbours change even though it starts before the canvas.
		const urls = preload;
		const color = washColor;
		if (!gl) return;
		for (const url of urls) gl.preload(url, color);
	});

	$effect(() => {
		const position = focal ?? { x: 50, y: 50 };
		if (src === lastSrc) return;
		lastSrc = src;

		// The first cover of a mount appears already in place: fading it in from transparent made the
		// cover blink every time Discover was returned to. Only a change of member crossfades.
		layers = [...layers.slice(-1), { id: nextId++, src, focal: position, fade: layers.length > 0 }];

		if (gl && src) {
			if (direction === 0) gl.set(src, washColor);
			// The shader's `dir` uniform is ported byte for byte from the prototype, whose wipe
			// travels from the edge dir itself names; this component's own `direction` prop is
			// the opposite convention (see above), so it is negated here, once, at the boundary.
			else gl.go(src, direction === 1 ? -1 : 1, dragFraction, washColor);
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
			class:fade={layer.fade}
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
	}

	.layer.fade {
		animation: hero-in var(--dur-xl) var(--ease) both;
	}

	.gl {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* Laid out from the start (so it has a size to draw at) but invisible until it holds the
		   photo: swapping display:none for block showed an unpainted canvas for a frame. */
		opacity: 0;
		pointer-events: none;
	}

	.gl.active {
		opacity: 1;
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
		.layer.fade {
			animation-duration: var(--dur-s);
		}
	}
</style>
