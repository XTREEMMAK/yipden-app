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
		class:has-action={toast.action}
		role="status"
		aria-live="polite"
		transition:fly={{ y: 12, duration: duration.m, easing: ease }}
	>
		<span>{toast.message}</span>
		{#if toast.action}
			<button class="action" onclick={() => toast.act()}>{toast.action.label}</button>
		{/if}
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

	/* Only a toast with something to tap takes taps, and only on its button. */
	.toast.has-action {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-block: 6px;
	}

	.toast span {
		flex: 1;
	}

	.action {
		flex: none;
		min-width: 44px;
		min-height: 44px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: none;
		/* Fixed, like the toast's own ground: about 9:1 on it, in every theme and skin. */
		color: #f6b08a;
		font: inherit;
		font-weight: 700;
		pointer-events: auto;
	}
</style>
