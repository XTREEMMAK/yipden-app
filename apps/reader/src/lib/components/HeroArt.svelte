<script lang="ts">
	import type { RingFocalPoint } from '@yipden/ring-client';

	/**
	 * The full bleed image behind a ring member.
	 *
	 * Two layers that crossfade, so a new member's image arrives over the old one instead of
	 * replacing it in a blink. The image is decoration, never content: it carries no meaning the
	 * text does not, so it is a background rather than an `img` and is hidden from assistive
	 * technology entirely.
	 *
	 * The brief allows a WebGL displacement wipe here as an optional upgrade over this
	 * crossfade. This is the documented fallback, and it is what ships first: every reader gets
	 * a hero that works before any reader gets one that is clever.
	 */

	interface Props {
		src: string | null;
		/** Drawn when a member has no image at all, derived from their id so it is stable. */
		wash: string;
		focal?: RingFocalPoint | undefined;
	}

	let { src, wash, focal }: Props = $props();

	/** The layer currently on top, and the one underneath it fading out. */
	let layers = $state<Array<{ id: number; src: string | null; focal: RingFocalPoint }>>([]);
	let nextId = 0;
	let lastSrc: string | null | undefined;

	$effect(() => {
		const position = focal ?? { x: 50, y: 50 };
		if (src === lastSrc) return;
		lastSrc = src;

		layers = [...layers.slice(-1), { id: nextId++, src, focal: position }];
	});
</script>

<div class="art" style:background-image={wash} aria-hidden="true">
	{#each layers as layer (layer.id)}
		<div
			class="layer"
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
	}

	.layer {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-repeat: no-repeat;
		animation: hero-in var(--dur-xl) var(--ease) both;
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
