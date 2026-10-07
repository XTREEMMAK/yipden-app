<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount, tick, untrack } from 'svelte';
	import { duration, prefersReducedMotion } from '$lib/motion.js';
	import { hostOf } from '$lib/hosts.js';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { tuckMini } from '$lib/actions/tuckMini.js';
	import { explored, showOf, type ExploredFilter } from '$lib/explored.svelte.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import { categoryLabel, sites, tagLabel } from '$lib/sites.svelte.js';
	import PartnerFilterSheet from './PartnerFilterSheet.svelte';
	import SiteCard from './SiteCard.svelte';

	/**
	 * Discover's Surf side: the sites index, by category, as cards with a moving preview.
	 *
	 * Sites are places, not people (docs/sites-contract.md): nothing here touches the ring, its
	 * rotation or anyone's follows. Laid out like a partner ring's panel (PartnerRingPanel.svelte):
	 * a fixed head over a scrolling stack of cards, the same `cardStack` fold, the same search,
	 * filter sheet, explored marks and remembered place. Category is the one thing a partner ring
	 * has no equivalent of, so it gets a row of its own rather than a place in the sheet.
	 *
	 * Order is newest added first, then by id: the index's own chronology, never a ranking.
	 */

	const VIEW_ID = 'surf';

	/** Sites the reader marked not for me are not shown again. */
	let listed = $derived(
		sites.all
			.filter((entry) => !verdicts.isHidden(entry.url))
			.slice()
			.sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? '') || (a.id < b.id ? -1 : 1))
	);
	let hiddenCount = $derived(sites.all.length - listed.length);

	let query = $state('');
	let category = $state<string | null>(null);
	let tag = $state<string | null>(null);
	let show = $state<ExploredFilter>('all');
	let filtersOpen = $state(false);
	let scroller = $state<HTMLDivElement | undefined>(undefined);

	let inCategory = $derived(
		category ? listed.filter((entry) => entry.category === category) : listed
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
		const needle = query.trim().toLowerCase();
		return inCategory.filter(
			(entry) =>
				(!tag || entry.tags.includes(tag)) &&
				(show === 'all' || explored.has(entry.url) === (show === 'explored')) &&
				(!needle ||
					[entry.title, entry.blurb, hostOf(entry.url), ...entry.tags.map(tagLabel)].some((field) =>
						field?.toLowerCase().includes(needle)
					))
		);
	});

	let exploredCount = $derived(inCategory.filter((entry) => explored.has(entry.url)).length);
	let filtering = $derived(show !== 'all' || tag !== null);
	let filterSummary = $derived(
		[
			show === 'unexplored' ? 'not explored yet' : show === 'explored' ? 'explored' : '',
			tag ? tagLabel(tag) : ''
		]
			.filter(Boolean)
			.join(', ')
	);

	function chooseCategory(next: string | null) {
		category = next;
		// A tag from another category would leave the list empty for no visible reason.
		if (tag && !inCategory.some((entry) => entry.tags.includes(tag!))) tag = null;
	}

	/*
	 * A changed search, category, tag or explored filter starts the list from the top and is
	 * remembered. The first run is the restored view itself, which keeps its own scroll position.
	 */
	let restored = false;
	$effect(() => {
		const view = { query, category, genre: tag, show };
		if (!restored) return;
		untrack(() => {
			explored.setView(VIEW_ID, { ...view, scrollTop: 0 });
			if (scroller) scroller.scrollTop = 0;
		});
	});

	function onScroll() {
		if (restored && scroller) explored.setView(VIEW_ID, { scrollTop: scroller.scrollTop });
		schedulePick();
	}

	/*
	 * Which card's clip runs: the first one, in list order, whose preview is mostly on screen and
	 * which the stack has not folded away. One at a time, so a phone decodes one video, never a
	 * screenful; none at all under reduced motion, where every card keeps its poster.
	 */
	let playingId = $state<string | null>(null);
	const visible = new Set<string>();
	let pickTimer: ReturnType<typeof setTimeout> | undefined;

	function pick() {
		if (prefersReducedMotion() || !scroller) {
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

	/** Settles after a fling rather than switching clips on every card that flies past. */
	function schedulePick() {
		clearTimeout(pickTimer);
		pickTimer = setTimeout(pick, 180);
	}

	function watchMedia(node: HTMLElement, id: string) {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) visible.add(id);
				else visible.delete(id);
				schedulePick();
			},
			{ root: node.closest('.scroll'), threshold: 0.6 }
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
		void sites.load();
		void creatorNotes.load();
		void explored.load().then(async () => {
			const view = explored.view(VIEW_ID);
			query = view.query;
			category = view.category ?? null;
			tag = view.genre;
			show = showOf(view);
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
		};
	});
</script>

<section
	class="surf"
	data-noswipe
	aria-label="Surf: sites"
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
>
	<header class="head">
		<div class="top-row">
			<input
				class="search"
				type="search"
				placeholder={`Search ${listed.length} sites`}
				aria-label="Search sites"
				autocomplete="off"
				spellcheck="false"
				bind:value={query}
			/>
			<button
				class="filter-btn"
				class:is-active={filtering}
				aria-label={`Filter sites${filtering ? `: ${filterSummary}` : ''}`}
				aria-haspopup="dialog"
				onclick={() => (filtersOpen = true)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
			</button>
		</div>
		<div class="categories" role="radiogroup" aria-label="Category">
			<button
				class="cat"
				role="radio"
				aria-checked={category === null}
				onclick={() => chooseCategory(null)}>All</button
			>
			{#each sites.categories as entry (entry.key)}
				<button
					class="cat"
					role="radio"
					aria-checked={category === entry.key}
					onclick={() => chooseCategory(entry.key)}
					>{categoryLabel(entry.key)}<small>{entry.count}</small></button
				>
			{/each}
		</div>
	</header>

	<div
		class="scroll"
		bind:this={scroller}
		use:cardStack={{ solidEntry: true }}
		use:tuckMini
		onscroll={onScroll}
	>
		<p class="note intro">
			Sites, not people: places on the indie web to wander. Nothing here is ranked.
		</p>
		<div class="stack-list">
			<ul class="cards">
				{#each shown as entry (entry.id)}
					<li class="yip-stack" data-id={entry.id} use:watchMedia={entry.id}>
						<div class="yip-rail">
							<SiteCard {entry} playing={playingId === entry.id} />
						</div>
					</li>
				{/each}
			</ul>
			{#if sites.status === 'ready' && !shown.length && listed.length}
				<p class="hidden-note">
					No sites match{query.trim() ? ` “${query.trim()}”` : ''}{category
						? ` in ${categoryLabel(category)}`
						: ''}{tag ? ` tagged ${tagLabel(tag)}` : ''}.
				</p>
			{/if}
			{#if sites.status === 'ready' && !sites.all.length}
				<p class="hidden-note">No sites to show yet.</p>
			{/if}
			{#if hiddenCount}
				<p class="hidden-note">
					{hiddenCount} hidden as not for me. You can bring {hiddenCount === 1 ? 'it' : 'them'} back in
					You.
				</p>
			{/if}
			<div class="stack-tail" aria-hidden="true"></div>
		</div>
	</div>
</section>

{#if filtersOpen}
	<PartnerFilterSheet
		ringName="sites"
		{show}
		genre={tag}
		genres={tags}
		counts={{
			all: inCategory.length,
			explored: exploredCount,
			unexplored: inCategory.length - exploredCount
		}}
		genreLabel={tagLabel}
		genreHeading="Tag"
		allGenresLabel="All tags"
		onshow={(next) => (show = next)}
		ongenre={(next) => (tag = next)}
		onclose={() => (filtersOpen = false)}
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

	/* Room at the top for Discover's People | Surf switch, which sits above this panel. */
	.head {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: calc(126px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.top-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.search {
		flex: 1;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		height: 44px;
		padding: 0 16px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
		font: inherit;
		font-size: 15px;
	}

	.search::placeholder {
		color: rgba(255, 255, 255, 0.7);
	}

	.filter-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
	}

	.filter-btn.is-active {
		background: #fff;
		color: var(--deep);
	}

	.filter-btn svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* One row that scrolls sideways: categories are few, and the row never wraps into the cards. */
	.categories {
		display: flex;
		gap: 8px;
		margin: 0 -20px;
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

	.note.intro {
		margin: 0 0 14px;
		color: rgba(255, 255, 255, 0.88);
		font-size: 13.5px;
		line-height: 1.4;
	}

	/* As PartnerRingPanel's `.scroll`, including the 6px the stack's observer needs at the top. */
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 6px 20px calc(var(--dock) + 8px);
		touch-action: pan-y;
		scrollbar-width: none;
	}

	.scroll::-webkit-scrollbar {
		display: none;
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

	.stack-tail {
		display: none;
	}

	:global(.scroll.stack) .stack-tail {
		display: block;
	}
</style>
