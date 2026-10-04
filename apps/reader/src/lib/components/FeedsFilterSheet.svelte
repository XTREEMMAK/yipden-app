<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { closeOnBack } from '$lib/closeOnBack.js';
	import { feeds, type FeedsScope } from '$lib/feeds.svelte.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';

	/**
	 * Feeds' Filter sheet: everyone, one folder, or one person. The same shape as Discover's
	 * Filter sheet, a single choice that closes the sheet. Folders are made under You.
	 */

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	/** Past this many people the list gets a box to narrow it. */
	const SEARCH_FROM = 12;

	let closeButton = $state<HTMLButtonElement | undefined>(undefined);
	let query = $state('');

	let people = $derived(
		[...feeds.people.values()].sort((left, right) =>
			left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
		)
	);
	let shownPeople = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return needle ? people.filter((person) => person.name.toLowerCase().includes(needle)) : people;
	});

	onMount(() => {
		closeButton?.focus();
		return closeOnBack('feedsFilter', onclose);
	});

	function choose(scope: FeedsScope) {
		void feeds.setScope(scope);
		onclose();
	}
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
	role="dialog"
	aria-modal="true"
	aria-label="Filter your feeds"
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<div class="sheet-head">
		<h2>Filter your feeds</h2>
		<button bind:this={closeButton} class="sheet-close" onclick={onclose} aria-label="Close">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</div>

	<div class="sheet-list" role="radiogroup" aria-label="Filter your feeds">
		<button
			class="sheet-row"
			role="radio"
			aria-checked={feeds.scope.kind === 'all'}
			onclick={() => choose({ kind: 'all' })}
		>
			<span class="sheet-dot" aria-hidden="true"></span>
			Everyone
		</button>

		<h3 class="sheet-sec">Folders</h3>
		{#each feeds.folders as folder (folder.name)}
			<button
				class="sheet-row"
				role="radio"
				aria-checked={feeds.scope.kind === 'folder' && feeds.scope.name === folder.name}
				onclick={() => choose({ kind: 'folder', name: folder.name })}
			>
				<span class="sheet-dot" aria-hidden="true"></span>
				<span class="sheet-name">{folder.name}</span>
				<small class="sheet-hint">{folder.count}</small>
			</button>
		{:else}
			<p class="sheet-note">No folders yet. Put someone in one from You.</p>
		{/each}

		{#if people.length}
			<h3 class="sheet-sec">People</h3>
			{#if people.length > SEARCH_FROM}
				<input
					class="sheet-search"
					type="search"
					placeholder="Find a person"
					aria-label="Find a person"
					bind:value={query}
				/>
			{/if}
			{#each shownPeople as person (person.id)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={feeds.scope.kind === 'person' && feeds.scope.id === person.id}
					onclick={() => choose({ kind: 'person', id: person.id })}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					<span class="sheet-name">{person.name}</span>
					{#if person.folder}<small class="sheet-hint">{person.folder}</small>{/if}
				</button>
			{:else}
				<p class="sheet-note">Nobody by that name.</p>
			{/each}
		{/if}
	</div>
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(15, 6, 2, 0.5);
		/* A mouse/touch convenience only: the dialog's own Close button and Escape are the
		   real keyboard path, so this stays out of tab order. */
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
		max-height: 70vh;
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
		place-items: center;
		flex: none;
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

	.sheet-list {
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

	.sheet-note {
		margin: 4px 16px 8px;
		color: var(--muted);
		font-size: 13.5px;
	}

	.sheet-search {
		box-sizing: border-box;
		height: 44px;
		margin: 4px 12px 6px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 15px;
	}

	.sheet-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: none;
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

	.sheet-row[aria-checked='true'] {
		color: var(--brand);
		font-weight: 650;
	}

	.sheet-dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 999px;
		border: 2px solid var(--muted);
	}

	.sheet-row[aria-checked='true'] .sheet-dot {
		border-color: var(--brand);
		background: var(--brand);
	}
</style>
