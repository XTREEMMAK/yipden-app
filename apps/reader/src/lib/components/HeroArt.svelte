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
	 * Ready covers use two layers to crossfade. If the incoming cover is still loading, the outgoing
	 * creator's art is removed immediately and the incoming creator's own wash is shown until its
	 * cover can be drawn. The image is decoration, never content: it carries no meaning the text does
	 * not, so it is a background rather than an `img` and is hidden from assistive technology.
	 *
	 * The brief allows a WebGL displacement wipe here as an optional upgrade over this fallback,
	 * and this is both: the CSS path stays available underneath, and a canvas drawn over it takes
	 * over visually whenever `createHeroGL` manages to stand one up. No WebGL context, a shader
	 * that will not compile, a lost context mid-session, all leave the CSS fallback as what the
	 * reader actually sees. A photo the canvas cannot read (in a browser, most of them: most
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
		preload?: Array<{ url: string; focal?: RingFocalPoint | undefined }>;
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
					if (!loaded) return;
					const newlyDrawable = !drawable.has(url);
					drawable = new Set(drawable).add(url);
					// A target can become current while its texture is still the one-pixel wash.
					// Re-selecting it after upload guarantees the real pixels paint immediately.
					if (newlyDrawable && url === src && gl) {
						const position = focal ?? { x: 50, y: 50 };
						gl.setFocal(url, position.x, position.y);
						gl.set(url, washColor);
					}
				},
				...(loadDataUrlNative ? { loadDataUrl: loadDataUrlNative } : {})
			}
		);
		glActive = gl !== null;
		if (!gl) return;
		gl.setLive(player.sheet !== 'full' && !document.hidden);
		if (src) gl.set(src, washColor);
		if (src && focal) gl.setFocal(src, focal.x, focal.y);
		for (const item of preload) preloadOne(item);
	}

	function preloadOne(item: { url: string; focal?: RingFocalPoint | undefined }) {
		if (!gl) return;
		if (item.focal) gl.setFocal(item.url, item.focal.x, item.focal.y);
		gl.preload(item.url, washColor);
	}

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let waited = 0;
		/*
		 * Not while a screen change is running. The layout marks the document (`data-nav`) for
		 * the length of a tab transition; standing the canvas up during it puts a shader compile and
		 * a texture upload in the middle of the slide, and its arrival is the thing that was
		 * visible as the cover changing when returning to Discover. Wait for the slide to finish
		 * (bounded, in case the marker is ever left behind), then start on the next frame.
		 */
		const whenSettled = () => {
			if (document.documentElement.dataset.nav && waited < 1500) {
				waited += 50;
				timer = setTimeout(whenSettled, 50);
				return;
			}
			timer = setTimeout(startGL, 0);
		};
		const frame = requestAnimationFrame(whenSettled);

		const onVisibility = () => gl?.setLive(!document.hidden);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	onDestroy(() => {
		destroyed = true;
		gl?.destroy();
	});

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
		const items = preload;
		void washColor;
		for (const item of items) void loadCssPhoto(item.url);
		if (!gl) return;
		for (const item of items) preloadOne(item);
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

		if (gl && src) {
			gl.setFocal(src, position.x, position.y);
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

<div class="art" style:background-image={wash} aria-hidden="true">
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

	.layer {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-repeat: no-repeat;
	}

	.layer.fade {
		animation: hero-in var(--dur-xl) var(--ease) both;
	}

	/*
	 * Exactly the box of `.art`, oversize included. They were different sizes (the cover 2% past
	 * every edge, the canvas flush with the screen), so the hand off from one to the other jumped in
	 * scale. A canvas is a replaced element, so `inset` alone would not stretch it: explicit size.
	 */
	.gl {
		position: absolute;
		left: -2%;
		top: -2%;
		width: 104%;
		height: 104%;
		/* Laid out from the start (so it has a size to draw at) but invisible until it holds the
		   photo: swapping display:none for block showed an unpainted canvas for a frame. */
		opacity: 0;
		pointer-events: none;
		/* The hand off from the CSS cover fades in rather than swapping, so any last difference
		   between the two (a focal point, a pixel of rounding) is eased, not popped. */
		transition: opacity var(--dur-m) var(--ease);
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
