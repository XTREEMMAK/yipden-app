<script lang="ts">
	import { fly } from 'svelte/transition';
	import { duration, ease } from '$lib/motion.js';
	import { toast } from '$lib/toast.svelte.js';
</script>

{#if toast.message}
	<!--
		Polite rather than assertive: a toast reports something the reader just did, so it should
		wait for a pause rather than interrupt whatever is being read.
	-->
	<div
		class="toast"
		role="status"
		aria-live="polite"
		transition:fly={{ y: 12, duration: duration.m, easing: ease }}
	>
		{toast.message}
	</div>
{/if}

<style>
	.toast {
		position: absolute;
		left: 14px;
		right: 14px;
		bottom: calc(var(--dock) + 10px);
		z-index: 40;
		padding: 13px 16px;
		border-radius: var(--r-input);
		background: var(--toast);
		color: #fff;
		font-size: 14px;
		line-height: 1.4;
		box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}
</style>
