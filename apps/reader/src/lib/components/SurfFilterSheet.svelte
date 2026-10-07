<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { categoryLabel, sites, tagLabel } from '$lib/sites.svelte.js';
	import type { ExploredFilter } from '$lib/explored.svelte.js';

	/**
	 * Surf's Filter sheet: category, tag and what the reader has explored. Category is also the
	 * row at the top of the list, which scrolls away with it; here it stays reachable from anywhere
	 * in the list. Each choice applies as it is made, as in a partner ring's sheet.
	 */

	interface Props {
		/** Tags within the chosen category, most used first. */
		tags: Array<{ tag: string; count: number }>;
		counts: { all: number; explored: number; unexplored: number };
		oncategory: (category: string | null) => void;
		onclose: () => void;
	}

	let { tags, counts, oncategory, onclose }: Props = $props();

	const SHOW: Array<{ key: ExploredFilter; label: string }> = [
		{ key: 'all', label: 'Everything' },
		{ key: 'unexplored', label: 'Not explored yet' },
		{ key: 'explored', label: 'Explored' }
	];
</script>

<Sheet title="Filter sites" {onclose} historyKey="surfFilter" maxHeight="75vh" class="filter-sheet">
	<div class="sheet-list">
		<h3 class="sheet-sec" id="surf-category">Category</h3>
		<div role="radiogroup" aria-labelledby="surf-category">
			<button
				class="sheet-row"
				role="radio"
				aria-checked={sites.category === null}
				onclick={() => oncategory(null)}
			>
				<span class="sheet-dot" aria-hidden="true"></span>
				<span class="sheet-name">All sites</span>
				<small class="sheet-hint">{sites.all.length}</small>
			</button>
			{#each sites.categories as entry (entry.key)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={sites.category === entry.key}
					onclick={() => oncategory(entry.key)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">{categoryLabel(entry.key)}</span>
					<small class="sheet-hint">{entry.count}</small>
				</button>
			{/each}
		</div>

		<h3 class="sheet-sec" id="surf-show">Show</h3>
		<div role="radiogroup" aria-labelledby="surf-show">
			{#each SHOW as entry (entry.key)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={sites.show === entry.key}
					onclick={() => (sites.show = entry.key)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">{entry.label}</span>
					<small class="sheet-hint">{counts[entry.key]}</small>
				</button>
			{/each}
		</div>

		{#if tags.length > 1}
			<h3 class="sheet-sec" id="surf-tag">Tag</h3>
			<div role="radiogroup" aria-labelledby="surf-tag">
				<button
					class="sheet-row"
					role="radio"
					aria-checked={sites.tag === null}
					onclick={() => (sites.tag = null)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">All tags</span>
				</button>
				{#each tags as entry (entry.tag)}
					<button
						class="sheet-row"
						role="radio"
						aria-checked={sites.tag === entry.tag}
						onclick={() => (sites.tag = entry.tag)}
					>
						<span class="sheet-dot" aria-hidden="true"></span>
						<span class="sheet-name">{tagLabel(entry.tag)}</span>
						<small class="sheet-hint">{entry.count}</small>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<button class="done" onclick={onclose}>Done</button>
</Sheet>

<style>
	/* The partner ring sheet's look (PartnerFilterSheet.svelte), so the two read as one family. */
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
