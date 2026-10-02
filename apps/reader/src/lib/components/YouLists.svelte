<script lang="ts">
	import { openExternal } from '$lib/platform/external.js';
	import { shareLink } from '$lib/platform/share.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { toast } from '$lib/toast.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import VerdictList from './VerdictList.svelte';

	/**
	 * You's three lists of creators the reader has not followed, as one tabbed section: Saved (the
	 * Shelf: "find them later"), Liked ("more like this") and Not for me. Each shows its newest
	 * `PAGE`, then "Show more" adds the next page in place, and past one page a filter box narrows
	 * by name, ring or address. No separate screens: the whole list is always reachable here.
	 */

	const PAGE = 25;

	type Tab = 'saved' | 'liked' | 'hidden';

	const TABS: Array<{ key: Tab; label: string; empty: string; note?: string }> = [
		{
			key: 'saved',
			label: 'Saved',
			empty:
				'Nothing saved yet. Save for later on any creator in Discover or a partner ring keeps them here.',
			note: 'Send hands a link to another device or app, like your desktop browser.'
		},
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

	let tab = $state<Tab>('saved');
	let query = $state('');
	let shown = $state(PAGE);
	let broken = $state<Set<string>>(new Set());

	const counts = $derived({
		saved: shelf.items.length,
		liked: verdicts.liked.length,
		hidden: verdicts.hidden.length
	});
	const current = $derived(TABS.find((entry) => entry.key === tab)!);
	const loaded = $derived(tab === 'saved' ? shelf.loaded : verdicts.loaded);

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	function matches(...fields: Array<string | undefined>): boolean {
		const needle = query.trim().toLowerCase();
		return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
	}

	const savedItems = $derived(
		shelf.items.filter((item) => matches(item.title, item.creator, item.via, hostOf(item.url)))
	);
	const verdictItems = $derived(
		(tab === 'liked' ? verdicts.liked : verdicts.hidden).filter((item) =>
			matches(item.name, item.via, hostOf(item.url))
		)
	);
	const total = $derived(tab === 'saved' ? savedItems.length : verdictItems.length);

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

	async function send(title: string, url: string) {
		const outcome = await shareLink(title, url);
		if (outcome === 'copied') toast.show('Link copied.');
		else if (outcome === 'unavailable') toast.show('Could not share that link.');
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
		{:else if tab === 'saved'}
			{#each savedItems.slice(0, shown) as item (item.id)}
				<div class="srow">
					<button
						class="open"
						onclick={() => openExternal(item.url)}
						aria-label={`Open ${item.title} on ${hostOf(item.url)}`}
					>
						{#if item.thumbUrl && !broken.has(item.id)}
							<img
								class="badge"
								src={item.thumbUrl}
								alt=""
								aria-hidden="true"
								loading="lazy"
								decoding="async"
								referrerpolicy="no-referrer"
								onerror={() => (broken = new Set(broken).add(item.id))}
							/>
						{/if}
						<span class="tt">
							<b>{item.title}</b>
							<small
								>{item.creator ? `${item.creator} · ` : ''}{item.via
									? `via ${item.via} · `
									: ''}{hostOf(item.url)}</small
							>
						</span>
					</button>
					<button
						class="mini-btn"
						aria-label={`Send ${item.title} to another device or app`}
						onclick={() => send(item.title, item.url)}
					>
						Send
					</button>
					<button
						class="mini-btn"
						aria-label={`Remove ${item.title} from Saved`}
						onclick={() => {
							void shelf.remove(item.id);
							toast.show('Removed from Saved.');
						}}
					>
						Remove
					</button>
				</div>
			{/each}
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
	{#if tab === 'saved'}
		<p class="note">
			Saved links stay on this phone until you export them, in your follows file or a full backup.
		</p>
	{/if}
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

	.srow {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 64px;
		box-sizing: border-box;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--ink);
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
	}

	.open {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		font: inherit;
	}

	.badge {
		flex: 0 0 auto;
		max-width: 64px;
		max-height: 32px;
		border-radius: 4px;
		object-fit: contain;
	}

	.tt {
		flex: 1;
		min-width: 0;
	}

	.srow b,
	.srow small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.srow b {
		font-size: 15px;
		font-weight: 600;
	}

	.srow small {
		margin-top: 2px;
		color: var(--muted);
		font-size: 12.5px;
	}

	.mini-btn {
		flex: 0 0 auto;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: inherit;
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
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
