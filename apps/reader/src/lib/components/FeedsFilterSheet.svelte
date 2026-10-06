<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { feeds, type FeedsScope } from '$lib/feeds.svelte.js';

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

	function choose(scope: FeedsScope) {
		void feeds.setScope(scope);
		onclose();
	}
</script>

<Sheet
	title="Filter your feeds"
	{onclose}
	historyKey="feedsFilter"
	maxHeight="70vh"
	class="filter-sheet"
>
	<div class="sheet-list" role="radiogroup" aria-label="Filter your feeds">
		<button
			class="sheet-row"
			role="radio"
			aria-checked={feeds.scope.kind === 'all'}
			onclick={() => choose({ kind: 'all' })}
		>
			<span class="sheet-av" aria-hidden="true">
				<svg viewBox="0 0 24 24"
					><circle cx="9" cy="9" r="3.2" /><path
						d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"
					/><circle cx="16.5" cy="9.5" r="2.6" /><path d="M15.5 14.6c2.6-.3 4.6 1.2 5 4.4" /></svg
				>
			</span>
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
				<span class="sheet-av" aria-hidden="true">
					<svg viewBox="0 0 24 24"><path d="M3.5 7.5h6l2 2h9v9h-17z" /></svg>
				</span>
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
					<!-- Their own picture when they have one; a plain person otherwise. -->
					<span
						class="sheet-av"
						class:pic={Boolean(person.iconUrl)}
						style:background-image={person.iconUrl ? `url(${person.iconUrl})` : ''}
						aria-hidden="true"
					>
						{#if !person.iconUrl}
							<svg viewBox="0 0 24 24"
								><circle cx="12" cy="9" r="3.6" /><path
									d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"
								/></svg
							>
						{/if}
					</span>
					<span class="sheet-name">{person.name}</span>
					{#if person.folder}<small class="sheet-hint">{person.folder}</small>{/if}
				</button>
			{:else}
				<p class="sheet-note">Nobody by that name.</p>
			{/each}
		{/if}
	</div>
</Sheet>

<style>
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

	/* Who or what a row is, as a small picture: ringed in the brand color when it is the choice. */
	.sheet-av {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
		color: var(--brand-ink);
	}

	.sheet-av svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.sheet-row[aria-checked='true'] .sheet-av {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--brand);
	}
</style>
