<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Shown at the centre of Discover while the ring is being fetched for the first time, the one
	 * moment there is nothing at all to draw. A reader with a saved ring never sees it.
	 *
	 * The default artwork is a ring that draws itself and turns. Pass `art` to replace it, for
	 * instance with the animated mascot later, without Discover having to change.
	 */
	let { art }: { art?: Snippet } = $props();
</script>

<div class="loader" role="status" aria-label="Loading the ring">
	{#if art}
		{@render art()}
	{:else}
		<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
			<circle class="track" cx="50" cy="50" r="40" />
			<circle class="arc" cx="50" cy="50" r="40" pathLength="100" />
		</svg>
	{/if}
</div>

<style>
	.loader {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		pointer-events: none;
		animation: appear var(--dur-l) var(--ease) both;
	}

	.ring {
		width: 84px;
		height: 84px;
		fill: none;
		stroke-width: 3;
		stroke-linecap: round;
		animation: turn 2.4s linear infinite;
	}

	.track {
		stroke: rgba(255, 255, 255, 0.16);
	}

	.arc {
		stroke: #fff;
		stroke-dasharray: 28 72;
		animation: breathe 1.8s var(--ease) infinite;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes breathe {
		50% {
			stroke-dasharray: 60 40;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ring,
		.arc {
			animation: none;
		}

		.arc {
			stroke-dasharray: 75 25;
		}
	}
</style>
