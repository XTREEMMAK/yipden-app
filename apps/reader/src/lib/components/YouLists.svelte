<script lang="ts">
	import { hostOf } from '$lib/hosts.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import VerdictList from './VerdictList.svelte';

	/**
	 * You's two lists of creators the reader has not followed, as one tabbed section: Liked ("more
	 * like this") and Not for me. Saved links (the Shelf) moved into the Library (2026-10-04).
	 * Each shows its newest `PAGE`, then "Show more" adds the next page in place, and past one page a filter box narrows
	 * by name, ring or address. No separate screens: the whole list is always reachable here.
	 */

	const PAGE = 25;

	type Tab = 'liked' | 'hidden';

	const TABS: Array<{ key: Tab; label: string; empty: string; note?: string }> = [
		{
			key: 'liked',
			label: 'Liked',
			empty: 'Nothing liked yet. Tap Like on a creator in Discover or a partner ring.'
		},
		{
			key: 'hidden',
			label: 'Not for me',
			empty:
				'Nobody hidden. Creators you mark Not for me stop appearing in Discover and partner rings.'
		}
	];

	let tab = $state<Tab>('liked');
	let query = $state('');
	let shown = $state(PAGE);

	const counts = $derived({
		liked: verdicts.liked.length,
		hidden: verdicts.hidden.length
	});
	const current = $derived(TABS.find((entry) => entry.key === tab)!);
	const loaded = $derived(verdicts.loaded);

	function matches(...fields: Array<string | undefined>): boolean {
		const needle = query.trim().toLowerCase();
		return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
	}

	const verdictItems = $derived(
		(tab === 'liked' ? verdicts.liked : verdicts.hidden).filter((item) =>
			matches(item.name, item.via, hostOf(item.url))
		)
	);
	const total = $derived(verdictItems.length);

	function choose(next: Tab) {
		tab = next;
		query = '';
		shown = PAGE;
	}

	/** Arrow keys move between tabs, as a tablist should. */
	function onTabKey(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const at = TABS.findIndex((entry) => entry.key === tab);
		const next = TABS[(at + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
		choose(next.key);
		document.getElementById(`list-tab-${next.key}`)?.focus();
	}
</script>

<section class="grp" aria-label="Your lists">
	<div class="tabs" role="tablist" aria-label="Your lists" tabindex="-1" onkeydown={onTabKey}>
		{#each TABS as entry (entry.key)}
			<button
				id={`list-tab-${entry.key}`}
				class="tab"
				role="tab"
				aria-selected={tab === entry.key}
				aria-controls="list-panel"
				tabindex={tab === entry.key ? 0 : -1}
				onclick={() => choose(entry.key)}
			>
				{entry.label}
				<span class="count">{counts[entry.key]}</span>
			</button>
		{/each}
	</div>

	<div
		id="list-panel"
		class="rows"
		role="tabpanel"
		aria-labelledby={`list-tab-${tab}`}
		tabindex="-1"
	>
		{#if counts[tab] > PAGE}
			<div class="filter">
				<input
					type="search"
					placeholder={`Filter ${current.label.toLowerCase()}`}
					aria-label={`Filter ${current.label}`}
					autocomplete="off"
					spellcheck="false"
					bind:value={query}
					oninput={() => (shown = PAGE)}
				/>
			</div>
		{/if}

		{#if !loaded}
			<p class="empty">Loading{'…'}</p>
		{:else if counts[tab] === 0}
			<p class="empty">{current.empty}</p>
		{:else if total === 0}
			<p class="empty">Nothing matches “{query.trim()}”.</p>
		{:else}
			<VerdictList kind={tab} items={verdictItems.slice(0, shown)} />
		{/if}

		{#if loaded && total > shown}
			<button class="more" onclick={() => (shown += PAGE)}>
				Show {Math.min(PAGE, total - shown)} more
				<span>{shown} of {total}</span>
			</button>
		{/if}
	</div>
	{#if current.note && counts[tab] > 0}<p class="note">{current.note}</p>{/if}
</section>

<style>
	.grp {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.tab {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 8px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
	}

	.tab[aria-selected='true'] {
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.count {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.filter {
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
	}

	.filter input {
		width: 100%;
		box-sizing: border-box;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 15px;
	}

	.empty {
		margin: 16px;
		color: var(--muted);
		font-size: 14px;
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 48px;
		border: 0;
		border-top: 1px solid var(--line);
		background: none;
		color: var(--brand-text);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
	}

	.more span {
		color: var(--muted);
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
	}

	.note {
		margin: 0 4px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.4;
	}
</style>
