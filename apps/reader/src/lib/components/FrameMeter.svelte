<script lang="ts">
	import { diagnostics, frameMeter, type ScrollReport } from '$lib/diagnostics.svelte.js';

	/**
	 * Debug builds only: after each scroll of `target`, how many frames ran late and the worst one,
	 * in a corner of the screen. What a phone can say about a stutter that a desk cannot see. Off
	 * unless Settings' Frame meter is on; a release build has none of it.
	 */

	interface Props {
		target: HTMLElement | Window | undefined;
		label: string;
	}

	let { target, label }: Props = $props();
	let report = $state<ScrollReport | null>(null);

	$effect(() => {
		if (!__YIPDEN_DEBUG__ || !diagnostics?.meter || !target) return;
		return frameMeter(target, (next) => (report = next));
	});
</script>

{#if __YIPDEN_DEBUG__ && diagnostics?.meter && report}
	<p class="meter" aria-live="polite">
		{label}
		{report.slow}/{report.frames} slow · worst {report.worst}ms
	</p>
{/if}

<style>
	.meter {
		position: fixed;
		top: calc(8px + env(safe-area-inset-top, 0px));
		right: 8px;
		z-index: 50;
		margin: 0;
		padding: 6px 10px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.8);
		color: #7cff9a;
		font-family: var(--mono);
		font-size: 12px;
		pointer-events: none;
	}
</style>
