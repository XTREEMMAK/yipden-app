<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount, tick, untrack } from 'svelte';
	import { duration, prefersReducedMotion } from '$lib/motion.js';
	import { hostOf } from '$lib/hosts.js';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { tuckMini } from '$lib/actions/tuckMini.js';
	import { explored, showOf } from '$lib/explored.svelte.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import { forums } from '$lib/forums.svelte.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';
	import { categoryLabel, tagLabel, type IndexState } from '$lib/sites.svelte.js';
	import IndexFilterSheet from './IndexFilterSheet.svelte';
	import SiteCard from './SiteCard.svelte';
	import SitePreview from './SitePreview.svelte';
	import type { SiteEntry } from '$lib/sites/types.js';

	/**
	 * Discover's places: an index (Surf's sites, or the forums) by category, as cards with a moving
	 * preview.
	 *
	 * Places, not people (docs/sites-contract.md): nothing here touches the ring, its rotation or
	 * anyone's follows of creators.
	 *
	 * It takes no room of its own above the cards. Search and Filter are round buttons in Discover's
	 * own bar (state on the index), and the category row is the first thing in the list, scrolling away
	 * with it; the Filter sheet offers category too, from anywhere in the list. Below that it is a
	 * partner ring's panel: the same `cardStack`, explored marks and remembered place.
	 *
	 * Order is newest added first, then by id: the index's own chronology, never a ranking.
	 */

	interface Props {
		index: IndexState;
		/** The region's name, for screen readers: "Surf: sites", "Forums". */
		label: string;
	}

	let { index, label }: Props = $props();

	/** Sites the reader marked not for me are not shown again. */
	let listed = $derived(
		index.all
			.filter((entry) => !verdicts.isHidden(entry.url))
			.slice()
			.sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? '') || (a.id < b.id ? -1 : 1))
	);
	let hiddenCount = $derived(index.all.length - listed.length);

	let scroller = $state<HTMLDivElement | undefined>(undefined);

	let inCategory = $derived(
		index.category ? listed.filter((entry) => entry.category === index.category) : listed
	);

	/** Tags within the chosen category, most used first. */
	let tags = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const entry of inCategory) {
			for (const each of entry.tags) counts.set(each, (counts.get(each) ?? 0) + 1);
		}
		return [...counts]
			.map(([key, count]) => ({ tag: key, count }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	});

	let shown = $derived.by(() => {
		const needle = index.query.trim().toLowerCase();
		return inCategory.filter(
			(entry) =>
				(!index.tag || entry.tags.includes(index.tag)) &&
				(index.show === 'all' || explored.has(entry.url) === (index.show === 'explored')) &&
				(!needle ||
					[entry.title, entry.blurb, hostOf(entry.url), ...entry.tags.map(tagLabel)].some((field) =>
						field?.toLowerCase().includes(needle)
					))
		);
	});

	let exploredCount = $derived(inCategory.filter((entry) => explored.has(entry.url)).length);

	function chooseCategory(next: string | null) {
		index.category = next;
		const tag = index.tag;
		// A tag from another category would leave the list empty for no visible reason.
		if (
			tag &&
			!(next ? listed.filter((entry) => entry.category === next) : listed).some((entry) =>
				entry.tags.includes(tag)
			)
		)
			index.tag = null;
	}

	/*
	 * A changed search, category, tag or explored filter starts the list from the top and is
	 * remembered. The first run is the restored view itself, which keeps its own scroll position.
	 */
	let restored = false;
	$effect(() => {
		const view = {
			query: index.query,
			category: index.category,
			genre: index.tag,
			show: index.show
		};
		if (!restored) return;
		untrack(() => {
			explored.setView(index.viewId, { ...view, scrollTop: 0 });
			if (scroller) scroller.scrollTop = 0;
		});
	});

	function onScroll() {
		if (restored && scroller) explored.setView(index.viewId, { scrollTop: scroller.scrollTop });
		schedulePick();
	}

	/*
	 * Which card's clip runs: the first one, in list order, whose preview is at least half on
	 * screen and which the stack has not folded away. One at a time, so a phone decodes one video,
	 * never a screenful; none at all under reduced motion, where every card keeps its poster.
	 */
	let playingId = $state<string | null>(null);
	const visible = new Set<string>();
	let pickTimer: ReturnType<typeof setTimeout> | undefined;

	/** The site whose whole preview is open: its clip plays there, so no card plays meanwhile. */
	let previewing = $state<SiteEntry | null>(null);

	function pick() {
		if (prefersReducedMotion() || !scroller || previewing) {
			playingId = null;
			return;
		}
		const cards = scroller.querySelectorAll<HTMLElement>('.cards > li');
		for (const card of cards) {
			const id = card.dataset.id;
			if (!id || !visible.has(id) || card.classList.contains('behind')) continue;
			const entry = shown.find((each) => each.id === id);
			if (entry?.preview_url) {
				playingId = id;
				return;
			}
		}
		playingId = null;
	}

	/**
	 * Settles after a fling rather than switching clips on every card that flies past: long enough
	 * for a fling's own frames to stop reporting, short enough not to feel like a wait.
	 */
	function schedulePick() {
		clearTimeout(pickTimer);
		pickTimer = setTimeout(pick, 100);
	}

	function watchMedia(node: HTMLElement, id: string) {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) visible.add(id);
				else visible.delete(id);
				schedulePick();
			},
			{ root: node.closest('.scroll'), threshold: 0.5 }
		);
		const media = node.querySelector('.media');
		if (media) observer.observe(media);
		return {
			destroy() {
				observer.disconnect();
				visible.delete(id);
			}
		};
	}

	// A new list (search, category) means new cards on screen.
	$effect(() => {
		void shown;
		schedulePick();
	});

	onMount(() => {
		void index.load();
		void creatorNotes.load();
		// A forum's card says whether it is already followed.
		void forums.load();
		void siteFollows.load();
		void explored.load().then(async () => {
			const view = explored.view(index.viewId);
			index.query = view.query;
			index.category = view.category ?? null;
			index.tag = view.genre;
			index.show = showOf(view);
			if (index.query) index.searchOpen = true;
			await tick();
			requestAnimationFrame(() => {
				if (scroller) scroller.scrollTop = view.scrollTop;
				restored = true;
				schedulePick();
			});
		});
		const onHide = () => {
			explored.flush();
			// A hidden app should not keep a video decoding.
			if (document.hidden) playingId = null;
			else schedulePick();
		};
		document.addEventListener('visibilitychange', onHide);
		return () => {
			clearTimeout(pickTimer);
			document.removeEventListener('visibilitychange', onHide);
			explored.flush();
			index.filtersOpen = false;
		};
	});
</script>

<section
	class="surf"
	data-noswipe
	aria-label={label}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
>
	<div
		class="scroll"
		bind:this={scroller}
		use:cardStack={{ flatEntry: true }}
		use:tuckMini
		onscroll={onScroll}
	>
		<!-- Scrolls away with the cards: the Filter sheet keeps category in reach below it. -->
		{#if index.categories.length > 1}
			<div class="categories" role="radiogroup" aria-label="Category">
				<button
					class="cat"
					role="radio"
					aria-checked={index.category === null}
					onclick={() => chooseCategory(null)}>All</button
				>
				{#each index.categories as entry (entry.key)}
					<button
						class="cat"
						role="radio"
						aria-checked={index.category === entry.key}
						onclick={() => chooseCategory(entry.key)}
						>{categoryLabel(entry.key)}<small>{entry.count}</small></button
					>
				{/each}
			</div>
		{/if}
		<div class="stack-list">
			<ul class="cards">
				{#each shown as entry (entry.id)}
					<li class="yip-stack" data-id={entry.id} use:watchMedia={entry.id}>
						<div class="yip-rail">
							<SiteCard
								{entry}
								playing={playingId === entry.id}
								onpreview={(chosen) => {
									previewing = chosen;
									playingId = null;
								}}
							/>
						</div>
					</li>
				{/each}
			</ul>
			{#if index.status === 'ready' && !shown.length && listed.length}
				<p class="hidden-note">
					No {index.noun} match{index.query.trim() ? ` “${index.query.trim()}”` : ''}{index.category
						? ` in ${categoryLabel(index.category)}`
						: ''}{index.tag ? ` tagged ${tagLabel(index.tag)}` : ''}.
				</p>
			{/if}
			{#if index.status === 'ready' && !index.all.length}
				<p class="hidden-note empty-note">{index.emptyNote}</p>
			{/if}
			{#if hiddenCount}
				<p class="hidden-note">
					{hiddenCount} hidden as not for me. You can bring {hiddenCount === 1 ? 'it' : 'them'} back in
					You.
				</p>
			{/if}
			<p class="hidden-note">Places, not people. Nothing here is ranked.</p>
			<div class="stack-tail" aria-hidden="true"></div>
		</div>
	</div>
</section>

{#if previewing}
	<SitePreview
		entry={previewing}
		onclose={() => {
			previewing = null;
			schedulePick();
		}}
	/>
{/if}

{#if index.filtersOpen}
	<IndexFilterSheet
		{index}
		{tags}
		counts={{
			all: inCategory.length,
			explored: exploredCount,
			unexplored: inCategory.length - exploredCount
		}}
		oncategory={chooseCategory}
		onclose={() => (index.filtersOpen = false)}
	/>
{/if}

<style>
	.surf {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		background: var(--deep);
		color: #fff;
		user-select: text;
	}

	/*
	 * Everything below Discover's own bar (logo and round buttons, drawn above this panel), and
	 * nothing else: the cards get the rest of the screen. 66px is the bar's own 22px top padding
	 * and 44px row.
	 */
	.scroll {
		flex: 1;
		min-height: 0;
		margin-top: calc(66px + env(safe-area-inset-top, 0px));
		overflow-y: auto;
		/* 6px at the top, as PartnerRingPanel's `.scroll`: the stack's observer needs it. */
		padding: 6px 20px calc(var(--dock) + 8px);
		touch-action: pan-y;
		scrollbar-width: none;
	}

	.scroll::-webkit-scrollbar {
		display: none;
	}

	/* One row that scrolls sideways: categories are few, and the row never wraps into the cards. */
	.categories {
		display: flex;
		gap: 8px;
		margin: 6px -20px 12px;
		padding: 0 20px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.categories::-webkit-scrollbar {
		display: none;
	}

	.cat {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
	}

	.cat small {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		opacity: 0.75;
	}

	.cat[aria-checked='true'] {
		background: #fff;
		color: #1f1410;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hidden-note {
		margin: 12px 16px 0;
		color: rgba(255, 255, 255, 0.7);
		font-size: 13px;
	}

	.empty-note {
		font-size: 14.5px;
		line-height: 1.5;
	}

	.stack-tail {
		display: none;
	}

	:global(.scroll.stack) .stack-tail {
		display: block;
	}
</style>
