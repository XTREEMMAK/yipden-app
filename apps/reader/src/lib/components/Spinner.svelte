<script lang="ts">
	/** A small turning ring for work in progress. It holds still for readers who ask for less motion. */
	let { label = 'Loading', size = 16 }: { label?: string; size?: number } = $props();
</script>

<span class="spinner" role="status" aria-label={label} style:width="{size}px" style:height="{size}px"
></span>

<style>
	.spinner {
		display: inline-block;
		flex: none;
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
		border-top-color: currentColor;
		vertical-align: -3px;
		animation: turn 0.8s linear infinite;
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}
</style>
