<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import {
		countByType,
		countsLine,
		groupByCreator,
		groupByDate,
		groupByType,
		libraryItems,
		searchLibrary,
		TYPE_LABELS,
		type LibraryItem,
		type LibraryType
	} from '$lib/library.js';
	import { flyIn } from '$lib/motion.js';
	import { openExternal } from '$lib/platform/external.js';
	import { shareLink } from '$lib/platform/share.js';
	import { siteBrowser } from '$lib/platform/siteBrowser.svelte.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { toast } from '$lib/toast.svelte.js';
	import { you } from '$lib/you.svelte.js';
	import ImagePreview from './ImagePreview.svelte';

	/**
	 * The Library: everything the reader kept, in one place at the top of You. Tracks, pictures,
	 * screenshots and passages kept from creators' pages, and links saved for later. Each says
	 * whose it is and reaches their site; nothing here is a copy of anything (`library.ts`).
	 *
	 * Opened by a toast's View with `?library=creator&of=<creatorId>` or `?library=type&of=<type>`,
	 * which narrows it and marks the newest item there.
	 */

	const PAGE = 25;
	const RECENT = 6;

	type View = 'type' | 'creator' | 'date';
	const VIEWS: Array<{ key: View; label: string }> = [
		{ key: 'type', label: 'By type' },
		{ key: 'creator', label: 'By creator' },
		{ key: 'date', label: 'By date' }
	];

	let view = $state<View>('type');
	let query = $state('');
	let shown = $state(PAGE);
	let preview = $state<LibraryItem | null>(null);
	/** What a View link narrowed to, until the reader clears it. */
	let only = $state<{ kind: 'creator' | 'type'; value: string } | null>(null);
	let marked = $state<string | null>(null);
	let section = $state<HTMLElement | undefined>(undefined);

	const all = $derived(
		libraryItems(
			creatorNotes.references,
			shelf.items,
			you.rows.map((row) => row.person)
		)
	);
	const counts = $derived(countByType(all));
	const narrowed = $derived(
		only
			? all.filter((item) =>
					only!.kind === 'creator' ? item.creatorId === only!.value : item.type === only!.value
				)
			: all
	);
	const found = $derived(searchLibrary(narrowed, query));
	const visible = $derived(found.slice(0, shown));
	const groups = $derived(
		view === 'type'
			? groupByType(visible)
			: view === 'creator'
				? groupByCreator(visible)
				: groupByDate(visible)
	);
	const onlyLabel = $derived(
		!only
			? ''
			: only.kind === 'type'
				? TYPE_LABELS[only.value as LibraryType]
				: (all.find((item) => item.creatorId === only!.value)?.creatorName ?? only.value)
	);

	// Arriving from a View: narrow, mark the newest there, and bring the Library into view.
	$effect(() => {
		const kind = page.url.searchParams.get('library');
		const value = page.url.searchParams.get('of');
		if ((kind !== 'creator' && kind !== 'type') || !value) return;
		only = { kind, value };
		view = kind === 'creator' ? 'creator' : 'type';
		query = '';
		shown = PAGE;
	});
	$effect(() => {
		if (!only || !page.url.searchParams.get('library')) return;
		const newest = narrowed[0];
		marked = newest?.key ?? null;
		if (newest) {
			requestAnimationFrame(() =>
				document
					.getElementById(`library-${newest.key}`)
					?.scrollIntoView({ block: 'center', behavior: 'smooth' })
			);
		} else {
			section?.scrollIntoView({ block: 'start' });
		}
	});

	onMount(() => {
		void creatorNotes.load();
		void shelf.load();
	});

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	function when(iso: string): string {
		const at = new Date(iso);
		if (Number.isNaN(at.getTime())) return '';
		return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** Whose it is, then what and when; a link says where it came from, as the Shelf always did. */
	function detail(item: LibraryItem): string {
		if (item.gone) return `${item.creatorName} · No longer on their site`;
		if (item.link) {
			const via = item.link.via ? ` · via ${item.link.via}` : '';
			return `${item.creatorName}${via} · ${hostOf(item.link.url)}`;
		}
		return `${item.creatorName} · ${TYPE_LABELS[item.type].replace(/s$/, '')} · ${when(item.at)}`;
	}

	function creatorOf(item: LibraryItem) {
		return { url: item.creatorUrl, name: item.creatorName };
	}

	/** What tapping an item does, by what it is. */
	function open(item: LibraryItem, from?: HTMLElement) {
		if (item.gone) return;
		const reference = item.reference;
		if (item.link) {
			openExternal(item.link.url);
			return;
		}
		if (!reference) return;
		if (item.type === 'tracks') {
			creatorNotes.play(creatorOf(item), reference.url, from);
		} else if (item.type === 'passages') {
			void creatorNotes.recheckOnOpen(reference.id);
			void siteBrowser.open(
				reference.textFragmentUrl ?? reference.url,
				creatorOf(item),
				prefs.sitesInApp
			);
		} else {
			void creatorNotes.recheckOnOpen(reference.id);
			preview = item;
		}
	}

	const ACTION: Record<LibraryType, string> = {
		tracks: 'Play',
		passages: 'Read on their page:',
		pictures: 'Show full screen:',
		screenshots: 'Show full screen:',
		links: 'Open'
	};

	function visit(item: LibraryItem) {
		void siteBrowser.open(item.creatorUrl, creatorOf(item), prefs.sitesInApp);
	}

	async function remove(item: LibraryItem) {
		if (item.link) await shelf.remove(item.link.id);
		else if (item.reference) await creatorNotes.removeReference(item.reference.id);
		toast.show('Removed from your Library.');
	}

	async function send(item: LibraryItem) {
		if (!item.link) return;
		const outcome = await shareLink(item.title, item.link.url);
		if (outcome === 'copied') toast.show('Link copied.');
		else if (outcome === 'unavailable') toast.show('Could not share that link.');
	}

	function showAll() {
		only = null;
		marked = null;
		shown = PAGE;
	}
</script>

{#snippet icon(type: LibraryType)}
	<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
		{#if type === 'tracks'}
			<path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle
				cx="16.5"
				cy="16"
				r="2.5"
			/>
		{:else if type === 'passages'}
			<path d="M7 7h4v4H8v3H5v-4zM15 7h4v4h-3v3h-3v-4z" />
		{:else if type === 'links'}
			<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path
				d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
			/>
		{:else}
			<rect x="4" y="5" width="16" height="14" rx="2" /><path d="m4 16 5-5 4 4 2-2 5 5" />
		{/if}
	</svg>
{/snippet}

{#snippet thumb(item: LibraryItem)}
	{#if (item.type === 'pictures' || item.type === 'screenshots') && !item.gone && item.reference}
		<!-- Loaded live from the creator's host; never stored. -->
		<img
			class="thumb"
			src={item.reference.url}
			alt=""
			referrerpolicy="no-referrer"
			loading="lazy"
			decoding="async"
		/>
	{:else}
		<span class="thumb icon">{@render icon(item.type)}</span>
	{/if}
{/snippet}

<section
	id="library"
	class="grp library"
	aria-labelledby="library-heading"
	bind:this={section}
	in:fly={flyIn()}
>
	<h3 class="grp-h" id="library-heading">
		Library
		{#if all.length}<span>{countsLine(counts)}</span>{/if}
	</h3>

	{#if !all.length}
		<div class="empty-state">
			<p>
				<b>Everything you keep, in one place.</b> Tracks, comic pages, game screenshots and passages you
				keep from creators’ sites, and links you save for later.
			</p>
			<p>
				To fill it, tap <b>Save for later</b> on a creator in Discover, or open their site from Visit
				and tap the keep button in the toolbar (a tray with an arrow).
			</p>
			<p class="small">
				Only links are kept, on this phone. Everything stays on its creator’s site.
			</p>
		</div>
	{:else}
		<!-- Only once there is more than a row's worth: below that, everything is already in view. -->
		{#if all.length > RECENT}
			<div class="recent-wrap">
				<h4 class="sub">Recent</h4>
				<ul class="recent" aria-label="Recently kept">
					{#each all.slice(0, RECENT) as item (item.key)}
						<li>
							<button
								class="recent-item"
								disabled={item.gone}
								aria-label={`${ACTION[item.type]} ${item.title}, from ${item.creatorName}`}
								onclick={(event) => open(item, event.currentTarget)}
							>
								{@render thumb(item)}
								<span class="recent-text">
									<b>{item.title}</b>
									<small>{item.creatorName}</small>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="controls">
			<div class="views" role="radiogroup" aria-label="Arrange the Library">
				{#each VIEWS as entry (entry.key)}
					<button
						role="radio"
						aria-checked={view === entry.key}
						class="view"
						class:on={view === entry.key}
						onclick={() => (view = entry.key)}>{entry.label}</button
					>
				{/each}
			</div>
			<input
				class="search"
				type="search"
				placeholder="Search titles, creators, passages"
				aria-label="Search your Library"
				autocomplete="off"
				spellcheck="false"
				bind:value={query}
				oninput={() => (shown = PAGE)}
			/>
		</div>

		{#if only}
			<p class="only">
				Showing {onlyLabel}
				<button class="link-btn" onclick={showAll}>Show everything</button>
			</p>
		{/if}

		{#if !found.length}
			<p class="empty">
				{query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing kept here yet.'}
			</p>
		{:else}
			{#each groups as group (group.key)}
				<div class="group">
					<h4 class="sub">{group.label} <span>{group.items.length}</span></h4>
					<ul class="items" aria-label={group.label}>
						{#each group.items as item (item.key)}
							<li id={`library-${item.key}`} class="item" class:marked={marked === item.key}>
								<button
									class="main"
									disabled={item.gone}
									aria-label={item.gone
										? `${item.title}, no longer on ${item.creatorName}’s site`
										: `${ACTION[item.type]} ${item.title}, from ${item.creatorName}`}
									onclick={(event) => open(item, event.currentTarget)}
								>
									{@render thumb(item)}
									<span class="text">
										<b>{item.title}</b>
										<small>{detail(item)}</small>
										{#if item.type === 'passages' && item.reference?.selector}
											<q>{item.reference.selector.exact}</q>
										{/if}
									</span>
								</button>
								<button
									class="mini"
									aria-label={`Visit ${item.creatorName}’s site, ${hostOf(item.creatorUrl)}`}
									onclick={() => visit(item)}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<circle cx="12" cy="12" r="9" />
										<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
									</svg>
								</button>
								{#if item.link}
									<button
										class="mini"
										aria-label={`Send ${item.title} to another device or app`}
										onclick={() => send(item)}
									>
										<svg viewBox="0 0 24 24" aria-hidden="true"
											><path d="M4 12l16-8-6 16-2-6z" /></svg
										>
									</button>
								{/if}
								<button
									class="mini"
									aria-label={`Remove ${item.title} from your Library`}
									onclick={() => remove(item)}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg
									>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
			{#if found.length > shown}
				<button class="more" onclick={() => (shown += PAGE)}>
					Show {Math.min(PAGE, found.length - shown)} more
					<span>{shown} of {found.length}</span>
				</button>
			{/if}
		{/if}
	{/if}
</section>

{#if preview?.reference}
	<ImagePreview src={preview.reference.url} alt={preview.title} onclose={() => (preview = null)} />
{/if}

<style>
	.library {
		display: flex;
		flex-direction: column;
		gap: 12px;
		scroll-margin-top: 16px;
	}

	/* The same section heading as You's own groups. */
	.grp-h {
		margin: 0 4px;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.grp-h span {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.02em;
		color: var(--muted);
		text-align: right;
	}

	.sub {
		margin: 0;
		font-family: var(--display);
		font-size: 14px;
		font-weight: 650;
	}

	.sub span {
		color: var(--muted);
		font-weight: 500;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border: 1px dashed var(--line);
		border-radius: 16px;
		font-size: 14px;
		line-height: 1.45;
	}

	.empty-state p {
		margin: 0;
	}

	.small {
		color: var(--muted);
		font-size: 13px;
	}

	.recent-wrap {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.recent {
		display: flex;
		gap: 8px;
		margin: 0;
		padding: 0 0 4px;
		overflow-x: auto;
		list-style: none;
		scroll-snap-type: x proximity;
	}

	.recent li {
		flex: none;
		scroll-snap-align: start;
	}

	.recent-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 120px;
		min-height: 44px;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.recent-item .thumb {
		width: 100%;
		height: 72px;
	}

	.recent-text,
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.recent-text b,
	.text b {
		overflow: hidden;
		font-size: 14px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	small {
		overflow: hidden;
		color: var(--muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.thumb {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		object-fit: cover;
	}

	.ic {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.views {
		display: flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.view {
		flex: 1;
		min-height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		transition:
			background var(--dur-s) var(--ease),
			color var(--dur-s) var(--ease);
	}

	.view.on {
		background: var(--brand);
		color: #fff;
	}

	.search {
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-input);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.only {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 0;
		font-size: 14px;
	}

	.link-btn {
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: none;
		color: var(--brand-text);
		font: inherit;
		font-weight: 600;
	}

	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: 14px;
		transition: background var(--dur-m) var(--ease);
	}

	/* Where a View landed: picked out until the reader moves on. */
	.item.marked {
		background: var(--brand-soft);
	}

	.main {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		min-width: 0;
		min-height: 44px;
		padding: 6px;
		border: 0;
		border-radius: 14px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.main:disabled {
		color: var(--muted);
	}

	q {
		display: -webkit-box;
		overflow: hidden;
		color: var(--ink);
		font-size: 13.5px;
		line-height: 1.4;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.mini {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
	}

	.mini svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 600;
	}

	.more span {
		color: var(--muted);
		font-weight: 500;
	}

	@media (prefers-reduced-motion: reduce) {
		.view,
		.item {
			transition: none;
		}
	}
</style>
