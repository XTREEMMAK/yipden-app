<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import type { ExploredFilter } from '$lib/explored.svelte.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';

	/**
	 * A partner ring's Filter sheet: whom to show by what the reader has explored, and by genre
	 * where the ring publishes them. It takes the place of the genre chips and the explored
	 * buttons above the list, which crowded the cards off a phone screen. Each choice applies as it
	 * is made; Done (or Back, or the backdrop) closes it.
	 *
	 * The explored counts live here now, on the choices they describe, instead of a separate line.
	 */

	interface Props {
		ringName: string;
		show: ExploredFilter;
		genre: string | null;
		genres: Array<{ tag: string; count: number }>;
		counts: { all: number; explored: number; unexplored: number };
		genreLabel: (tag: string) => string;
		onshow: (show: ExploredFilter) => void;
		ongenre: (genre: string | null) => void;
		onclose: () => void;
	}

	let { ringName, show, genre, genres, counts, genreLabel, onshow, ongenre, onclose }: Props =
		$props();

	let closeButton = $state<HTMLButtonElement | undefined>(undefined);

	const SHOW: Array<{ key: ExploredFilter; label: string }> = [
		{ key: 'all', label: 'Everyone' },
		{ key: 'unexplored', label: 'Not explored yet' },
		{ key: 'explored', label: 'Explored' }
	];

	onMount(() => {
		closeButton?.focus();
		return closeOnBack('partnerFilter', onclose);
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onclose();
	}}
/>

<button
	type="button"
	class="sheet-backdrop"
	tabindex="-1"
	aria-label="Close"
	onclick={onclose}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
></button>
<div
	class="filter-sheet"
	data-noswipe
	role="dialog"
	aria-modal="true"
	aria-label={`Filter ${ringName}`}
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="sheet-head">
		<h2>Filter {ringName}</h2>
		<button bind:this={closeButton} class="sheet-close" onclick={onclose} aria-label="Close">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>

	<div class="sheet-list">
		<h3 class="sheet-sec" id="partner-show">Show</h3>
		<div role="radiogroup" aria-labelledby="partner-show">
			{#each SHOW as entry (entry.key)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={show === entry.key}
					onclick={() => onshow(entry.key)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">{entry.label}</span>
					<small class="sheet-hint">{counts[entry.key]}</small>
				</button>
			{/each}
		</div>

		{#if genres.length > 1}
			<h3 class="sheet-sec" id="partner-genre">Genre</h3>
			<div role="radiogroup" aria-labelledby="partner-genre">
				<button
					class="sheet-row"
					role="radio"
					aria-checked={genre === null}
					onclick={() => ongenre(null)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">All genres</span>
				</button>
				{#each genres as entry (entry.tag)}
					<button
						class="sheet-row"
						role="radio"
						aria-checked={genre === entry.tag}
						onclick={() => ongenre(entry.tag)}
					>
						<span class="sheet-dot" aria-hidden="true"></span>
						<span class="sheet-name">{genreLabel(entry.tag)}</span>
						<small class="sheet-hint">{entry.count}</small>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<button class="done" onclick={onclose}>Done</button>
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(15, 6, 2, 0.5);
		cursor: default;
	}

	.filter-sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 35;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 75vh;
		padding: 18px 8px calc(20px + env(safe-area-inset-bottom, 0px));
		border-radius: 24px 24px 0 0;
		background: var(--ground);
		color: var(--ink);
		box-shadow: 0 -12px 30px -10px rgba(0, 0, 0, 0.3);
		overflow-y: auto;
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px 10px;
	}

	.sheet-head h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 650;
	}

	.sheet-close {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.sheet-close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.sheet-list,
	[role='radiogroup'] {
		display: flex;
		flex-direction: column;
	}

	.sheet-sec {
		margin: 12px 16px 4px;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.sheet-row {
		display: flex;
		flex: none;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 0 16px;
		border: 0;
		border-radius: 12px;
		background: none;
		color: var(--ink);
		font-family: var(--body);
		font-size: 15px;
		font-weight: 500;
		text-align: left;
	}

	.sheet-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sheet-hint {
		flex: none;
		margin-left: auto;
		color: var(--muted);
		font-size: 12px;
		font-weight: 400;
	}

	.sheet-dot {
		flex: none;
		width: 18px;
		height: 18px;
		border: 2px solid var(--line);
		border-radius: 999px;
		transition:
			border-color var(--dur-s) var(--ease),
			box-shadow var(--dur-s) var(--ease);
	}

	.sheet-row[aria-checked='true'] .sheet-dot {
		border-color: var(--brand);
		box-shadow: inset 0 0 0 4px var(--brand);
	}

	.done {
		min-height: 48px;
		margin: 10px 12px 0;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font: inherit;
		font-weight: 650;
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet-dot {
			transition: none;
		}
	}
</style>
