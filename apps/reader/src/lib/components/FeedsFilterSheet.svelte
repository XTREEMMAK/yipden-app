<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Segmented from './Segmented.svelte';
	import { feeds, type FeedsScope } from '$lib/feeds.svelte.js';
	import { forums } from '$lib/forums.svelte.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';

	/**
	 * Yips' Filter sheet, in tabs so no list runs long: what kind of den to read, then one person, or
	 * one folder. Choosing closes the sheet. Folders are made under You.
	 *
	 * Sites and Forums are offered only to a reader who follows one (pasted in Follow): Discover no
	 * longer shows them (2026-10-14), so for most readers there is nothing but people, and then the
	 * "Show" tab, which would only say "everything" or "people", is not there at all.
	 */

	type Kind = 'all' | 'people' | 'sites' | 'forums';

	interface Props {
		onclose: () => void;
		/** Which kind of den is read now, and how to change it. */
		kind: Kind;
		onkind: (next: Kind) => void;
	}

	let { onclose, kind, onkind }: Props = $props();

	type Tab = 'show' | 'person' | 'folder';
	const KINDS = $derived([
		{ value: 'all' as const, label: 'Everything you follow', count: 0, icon: 'all' },
		{ value: 'people' as const, label: 'People', count: feeds.unreadCount, icon: 'people' },
		...(siteFollows.follows.length
			? [{ value: 'sites' as const, label: 'Sites', count: siteFollows.activeCount, icon: 'sites' }]
			: []),
		...(forums.follows.length
			? [{ value: 'forums' as const, label: 'Forums', count: forums.activeCount, icon: 'forums' }]
			: [])
	]);
	/** Only worth a tab when there is something besides people to choose. */
	let hasShow = $derived(KINDS.length > 2);

	let tab = $state<Tab>(
		feeds.scope.kind === 'person'
			? 'person'
			: feeds.scope.kind === 'folder'
				? 'folder'
				: siteFollows.follows.length || forums.follows.length
					? 'show'
					: 'person'
	);
	$effect(() => {
		if (tab === 'show' && !hasShow) tab = 'person';
	});

	/**
	 * The tab's content changes size when the tab does. Its box follows the content's measured
	 * height, eased, so the sheet grows and shrinks instead of jumping.
	 */
	function followHeight(box: HTMLElement) {
		const inner = box.firstElementChild as HTMLElement;
		const set = () => (box.style.height = `${inner.offsetHeight}px`);
		set();
		// No easing for the first measure: the sheet opens at its size.
		requestAnimationFrame(() => (box.style.transition = ''));
		const watcher = new ResizeObserver(set);
		watcher.observe(inner);
		return { destroy: () => watcher.disconnect() };
	}

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

	function chooseScope(scope: FeedsScope) {
		void feeds.setScope(scope);
		onkind('people');
		onclose();
	}

	function chooseKind(next: Kind) {
		// Reading a kind of den is not reading one person: the narrowing to a person goes.
		void feeds.setScope({ kind: 'all' });
		onkind(next);
		onclose();
	}
</script>

<Sheet
	title="Filter your yips"
	{onclose}
	historyKey="feedsFilter"
	maxHeight="70vh"
	class="filter-sheet"
>
	<div class="tabs">
		<Segmented
			label="Filter by"
			options={[
				...(hasShow ? [{ value: 'show' as const, label: 'Show' }] : []),
				{ value: 'person' as const, label: 'Person' },
				{ value: 'folder' as const, label: 'Folders' }
			]}
			value={tab}
			onchange={(next) => (tab = next)}
		/>
	</div>

	<div class="swap" use:followHeight>
		<div class="swap-inner">
			{#if tab === 'show'}
				<div class="sheet-list" role="radiogroup" aria-label="Show">
					{#each KINDS as option (option.value)}
						<button
							class="sheet-row"
							role="radio"
							aria-checked={kind === option.value && feeds.scope.kind === 'all'}
							onclick={() => chooseKind(option.value)}
						>
							<span class="sheet-av" aria-hidden="true">
								<svg viewBox="0 0 24 24">
									{#if option.icon === 'all'}
										<path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
									{:else if option.icon === 'people'}
										<circle cx="12" cy="9" r="3.6" /><path
											d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"
										/>
									{:else if option.icon === 'sites'}
										<circle cx="12" cy="12" r="9" /><path
											d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"
										/>
									{:else}
										<path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" />
									{/if}
								</svg>
							</span>
							<span class="sheet-name">{option.label}</span>
							{#if option.count > 0}<small class="sheet-hint">{option.count} new</small>{/if}
						</button>
					{/each}
				</div>
			{:else if tab === 'folder'}
				<div class="sheet-list" role="radiogroup" aria-label="Folders">
					<button
						class="sheet-row"
						role="radio"
						aria-checked={feeds.scope.kind === 'all' && kind === 'all'}
						onclick={() => chooseKind('all')}
					>
						<span class="sheet-av" aria-hidden="true">
							<svg viewBox="0 0 24 24"
								><path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /></svg
							>
						</span>
						<span class="sheet-name">Everyone</span>
					</button>
					{#each feeds.folders as folder (folder.name)}
						<button
							class="sheet-row"
							role="radio"
							aria-checked={feeds.scope.kind === 'folder' && feeds.scope.name === folder.name}
							onclick={() => chooseScope({ kind: 'folder', name: folder.name })}
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
				</div>
			{:else}
				<div class="sheet-list" role="radiogroup" aria-label="Person">
					<button
						class="sheet-row"
						role="radio"
						aria-checked={feeds.scope.kind === 'all' && kind === 'all'}
						onclick={() => chooseKind('all')}
					>
						<span class="sheet-av" aria-hidden="true">
							<svg viewBox="0 0 24 24"
								><path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /></svg
							>
						</span>
						<span class="sheet-name">Everyone</span>
					</button>
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
							onclick={() => chooseScope({ kind: 'person', id: person.id })}
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
						<p class="sheet-note">
							{people.length ? 'Nobody by that name.' : 'Nobody followed yet.'}
						</p>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Sheet>

<style>
	/* Eased to the tab's height, so switching tabs never jumps the sheet. */
	.swap {
		overflow: hidden;
		transition: height var(--dur-m, 0.25s) var(--ease, ease);
	}

	@media (prefers-reduced-motion: reduce) {
		.swap {
			transition: none;
		}
	}

	.tabs {
		display: flex;
		padding: 0 16px 8px;
	}

	.sheet-list {
		display: flex;
		flex-direction: column;
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
