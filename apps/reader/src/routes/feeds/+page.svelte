<script lang="ts">
	import Segmented from '$components/Segmented.svelte';
	import { hostOf } from '$lib/hosts.js';
	import { profileHref } from '$lib/creatorProfile.svelte.js';
	import { onMount } from 'svelte';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { readOnScroll } from '$lib/actions/readOnScroll.js';
	import { tuckMini } from '$lib/actions/tuckMini.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { ring } from '$lib/ring.svelte.js';
	import { displayAuthor, feeds, FEEDS_FILTERS, sourceLabel } from '$lib/feeds.svelte.js';
	import { shelf, toggleShelf } from '$lib/shelf.svelte.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import type { FeedYip } from '$lib/syndication.js';
	import type { StoredYip } from '$lib/store/index.js';
	import YipCard from '$components/YipCard.svelte';
	import Toast from '$components/Toast.svelte';
	import RingMemberCard from '$components/RingMemberCard.svelte';
	import FeedsFilterSheet from '$components/FeedsFilterSheet.svelte';
	import ForumTopicCard from '$components/ForumTopicCard.svelte';
	import { forums } from '$lib/forums.svelte.js';
	import { page } from '$app/state';

	/**
	 * Feeds: everything followed, merged and reverse chronological, in four panes a reader
	 * pages between by pill. Swiping sideways was removed: it fought the vertical scroll and
	 * the pull to refresh, and the pills are always on screen. Each pane keeps its own scroll position because all
	 * four stay mounted; only the track that holds them moves.
	 */

	let scopeSheetOpen = $state(false);
	let scopeButton = $state<HTMLButtonElement | undefined>(undefined);

	function closeScopeSheet() {
		scopeSheetOpen = false;
		scopeButton?.focus();
	}

	/**
	 * Feeds reads two kinds of source: people, through the four pills, and forums, as one digest
	 * of topics. A switch at the top chooses between them, so the pills stay four and forum topics
	 * never mix into the people's panes: a forum is a place, not a person (decided 2026-10-05).
	 */
	let onForums = $state(false);
	/** The one person Feeds is narrowed to, whose name then opens their profile. */
	let scopedPerson = $derived(
		feeds.scope.kind === 'person' ? (feeds.people.get(feeds.scope.id) ?? null) : null
	);
	let filterIndex = $derived(
		onForums
			? FEEDS_FILTERS.length
			: FEEDS_FILTERS.findIndex((filter) => filter.key === feeds.filter)
	);
	let selectedPill = $derived(onForums ? 'forums' : feeds.filter);

	$effect(() => {
		if (page.url.searchParams.get('pane') === 'forums') onForums = true;
	});
	let viewport: HTMLDivElement | undefined;

	/*
	 * The sliding indicator tracks each pill's real, measured position rather than assuming
	 * equal widths. Pills size to their own label, same as the reference prototype, so
	 * "Everything" and "Watch" are different widths and a percentage-based guess clips the
	 * longer ones against the indicator's own rounded edge.
	 */
	let pillEls: HTMLButtonElement[] = [];
	let indicator = $state({ left: 0, width: 0 });

	function measureIndicator() {
		const el = pillEls[filterIndex];
		if (el) indicator = { left: el.offsetLeft, width: el.offsetWidth };
	}

	$effect(() => {
		// The selection is read so this effect reruns when it changes, and again when the
		// pills come back from Forums.
		void selectedPill;
		if (!onForums) measureIndicator();
	});

	// Pull to refresh: a vertical drag from the top of the active pane.
	let pullY = $state(0);
	let pulling = $state(false);
	let pullStartY = 0;
	let pullPointerId: number | null = null;
	const PULL_THRESHOLD = 64;

	onMount(() => {
		void feeds.loadAndCatchUp();
		// Forums checked only when due: each has its own pace, slower than creators' feeds.
		void forums.refresh();
		void shelf.load();
		void creatorNotes.load();
		if (!ring.all.length) void ring.load();

		/*
		 * "Background refresh where Capacitor allows," scoped for v0.9: refreshing on a native
		 * background schedule needs a plugin with its own permission, which is asked about
		 * before it is added (see the brief). Refreshing when the reader returns to the app
		 * needs nothing extra and covers the case that actually matters most: opening YipDen
		 * after it sat in the background for a while.
		 */
		let hiddenAt: number | null = null;
		const onVisibility = () => {
			if (document.hidden) {
				hiddenAt = Date.now();
				return;
			}
			if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000) {
				void feeds.refresh();
				void forums.refresh();
			}
			hiddenAt = null;
		};
		document.addEventListener('visibilitychange', onVisibility);

		// A rotation, a font swap or a window resize can change every pill's width at once.
		const onResize = () => measureIndicator();
		window.addEventListener('resize', onResize);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('resize', onResize);
		};
	});

	/** A card that scrolled off the top counts as read, when the reader turned that on. */
	function markScrolledPast(key: string) {
		if (onForums) return;
		const yip = feeds.panes[feeds.filter].find((candidate) => candidate.key === key);
		if (yip && !yip.readAt) void feeds.markRead(yip);
	}

	function activePane(): HTMLElement | null {
		return viewport?.querySelector(`[data-pane="${selectedPill}"]`) ?? null;
	}

	function onPullStart(event: PointerEvent) {
		const pane = activePane();
		if (!pane || pane.scrollTop > 0 || pullPointerId !== null) return;
		pullPointerId = event.pointerId;
		pullStartY = event.clientY;
		pulling = true;
	}

	function onPullMove(event: PointerEvent) {
		if (event.pointerId !== pullPointerId) return;
		const delta = event.clientY - pullStartY;
		if (delta <= 0) {
			pullY = 0;
			return;
		}
		// Resistance past the threshold, so the gesture does not feel like it runs away.
		pullY = delta < PULL_THRESHOLD ? delta : PULL_THRESHOLD + (delta - PULL_THRESHOLD) * 0.3;
	}

	async function onPullEnd(event: PointerEvent) {
		if (event.pointerId !== pullPointerId) return;
		pullPointerId = null;
		pulling = false;
		const shouldRefresh = pullY >= PULL_THRESHOLD;
		pullY = 0;
		if (!shouldRefresh) return;
		// A pull on Forums checks every forum now; anywhere else, the forums that are due.
		if (onForums) await forums.refresh({ force: true });
		else await Promise.all([feeds.refresh(), forums.refresh()]);
	}

	function sourceHost(yip: StoredYip): string {
		return hostOf(yip.url);
	}

	/** A yip from a site that declared, or was found to be, built for a bigger screen. */
	function isDesktopFirst(yip: StoredYip): boolean {
		const person = feeds.personFor(yip);
		return !!person && creatorNotes.layoutFor(person.siteUrl, person.layout) === 'desktop-first';
	}

	function saveForLater(yip: StoredYip) {
		void toggleShelf({
			url: yip.url,
			title: yip.title && yip.title !== 'Untitled' ? yip.title : sourceHost(yip),
			creator: displayAuthor(yip, feeds.personFor(yip)?.name),
			from: 'feeds'
		});
	}

	function openCopy(group: FeedYip, copy: StoredYip) {
		void feeds.markRead(group);
		openExternal(copy.url);
	}
</script>

<svelte:head><title>Feeds</title></svelte:head>

<div class="feeds">
	<!--
		Two rows and no more, so the cards get the screen (phone feedback, 2026-10-07): what to read
		and a filter beside it, then the panes. The counts that were the big title are a heading for
		screen readers and a badge on what they count.
	-->
	<header class="head">
		<h2 class="visually-hidden">
			{#if onForums}
				{forums.activeCount} active {forums.activeCount === 1 ? 'topic' : 'topics'} · {forums.forums
					.length}
				{forums.forums.length === 1 ? 'forum' : 'forums'}
			{:else}
				{feeds.unreadCount} new yips from {feeds.peopleCount}
				{feeds.peopleCount === 1 ? 'person' : 'people'}
			{/if}
		</h2>
		<div class="head-row">
			<Segmented
				label="What to read"
				options={[
					{ value: 'people', label: 'People' },
					{ value: 'forums', label: 'Forums', badge: forums.activeCount }
				]}
				value={onForums ? 'forums' : 'people'}
				onchange={(next) => (onForums = next === 'forums')}
			/>
			{#if !onForums && feeds.scopeLabel}
				{#if scopedPerson}
					<a
						class="scope"
						href={profileHref(scopedPerson.siteUrl)}
						aria-label={`${feeds.scopeLabel}'s profile`}>{feeds.scopeLabel}</a
					>
				{:else}
					<span class="scope">{feeds.scopeLabel}</span>
				{/if}
			{/if}
			{#if onForums}
				<a class="scope-btn" href="/you/forums" aria-label="Manage your forums">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 6h10M4 12h16M4 18h7M18 4v4M14 6h8" />
					</svg>
				</a>
			{:else}
				<button
					bind:this={scopeButton}
					class="scope-btn"
					class:is-active={feeds.scope.kind !== 'all'}
					onclick={() => (scopeSheetOpen = true)}
					aria-haspopup="dialog"
					aria-expanded={scopeSheetOpen}
					aria-label={feeds.scopeLabel
						? `Filter your feeds: ${feeds.scopeLabel}`
						: 'Filter your feeds'}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16M7 12h10M10 19h4" />
					</svg>
				</button>
			{/if}
		</div>

		<div class="pills" role="tablist" aria-label="Filter yips" hidden={onForums}>
			<span
				class="ind"
				aria-hidden="true"
				style:transform={`translateX(${indicator.left}px)`}
				style:width={`${indicator.width}px`}
			></span>
			{#each FEEDS_FILTERS as filter, index (filter.key)}
				<button
					bind:this={pillEls[index]}
					class="pill"
					role="tab"
					id="pill-{filter.key}"
					aria-controls="pane-{filter.key}"
					aria-selected={selectedPill === filter.key}
					onclick={() => feeds.setFilter(filter.key)}
				>
					{filter.label}
					{#if filter.key === 'everything' && feeds.unreadCount}
						<span class="new-count" aria-label={`${feeds.unreadCount} new`}
							>{feeds.unreadCount}</span
						>
					{/if}
				</button>
			{/each}
		</div>
	</header>

	<div class="viewport" bind:this={viewport}>
		{#if feeds.status === 'refreshing' && !pulling && pullY === 0}
			<div class="pull refreshing" role="status" aria-label="Refreshing your feeds">
				<span class="spinner"></span>
			</div>
		{/if}
		{#if pulling || pullY > 0}
			<div class="pull" style:opacity={Math.min(1, pullY / PULL_THRESHOLD)} aria-hidden="true">
				<span class="spinner" class:ready={pullY >= PULL_THRESHOLD}></span>
			</div>
		{/if}

		<div class="track" style:transform={`translateX(${-filterIndex * 100}%)`}>
			{#each FEEDS_FILTERS as filter (filter.key)}
				<div
					class="pane"
					data-pane={filter.key}
					role="tabpanel"
					tabindex="0"
					id="pane-{filter.key}"
					aria-labelledby="pill-{filter.key}"
					inert={selectedPill !== filter.key}
					use:cardStack={{ active: selectedPill === filter.key }}
					use:tuckMini
					use:readOnScroll={{
						enabled: () => prefs.markReadOnScroll && selectedPill === filter.key,
						onRead: markScrolledPast
					}}
					onpointerdown={onPullStart}
					onpointermove={onPullMove}
					onpointerup={onPullEnd}
					onpointercancel={onPullEnd}
				>
					{#if feeds.status === 'loading'}
						<p class="empty">Loading{'…'}</p>
					{:else if feeds.panes[filter.key].length === 0}
						<p class="empty">
							{feeds.scopeLabel
								? `Nothing from ${feeds.scopeLabel} here yet.`
								: filter.key === 'everything'
									? 'Nothing here yet. Follow someone to see their yips.'
									: 'Nothing here yet.'}
						</p>
					{:else}
						<div class="stack-list">
							{#each feeds.panes[filter.key] as yip, index (yip.key)}
								<div in:fly={flyIn({ delay: staggerDelay(index) })}>
									<div class="yip-stack" data-key={yip.key}>
										<div class="yip-rail">
											<div class="yip-fold">
												<YipCard {yip} />
												{#if isDesktopFirst(yip)}
													{@const saved = shelf.has(yip.url)}
													<div class="shelf-bar">
														<span class="shelf-label">Best on desktop</span>
														<button
															class="shelf-btn"
															aria-pressed={saved}
															aria-label={saved
																? `Remove ${yip.title || 'this yip'} from Saved`
																: `Save ${yip.title || 'this yip'} for later`}
															onclick={() => saveForLater(yip)}
														>
															{saved ? 'Saved' : 'Save for later'}
														</button>
													</div>
												{/if}
												{#if yip.crosspostGroupId && yip.crossposts && yip.crossposts.length > 1}
													<div class="crosspost-bar" aria-label="Copies of this post">
														<span class="crosspost-label">Same post</span>
														<div class="source-chips">
															{#each yip.crossposts as copy (copy.key)}
																<button
																	class="source-chip"
																	title={`Open on ${sourceHost(copy)}`}
																	aria-label={`Open ${sourceLabel(copy)} copy on ${sourceHost(copy)}`}
																	onclick={() => openCopy(yip, copy)}
																>
																	{sourceLabel(copy)}
																</button>
															{/each}
														</div>
														<button
															class="separate"
															onclick={() => feeds.showSeparately(yip.crosspostGroupId!)}
														>
															Show separately
														</button>
													</div>
												{/if}
											</div>
										</div>
									</div>
								</div>
							{/each}
							<div class="stack-tail" aria-hidden="true"></div>
						</div>
					{/if}

					{#if filter.key === 'listen' && ring.all.length}
						{@const members = ring.shown.filter((entry) => (entry.tracks?.length ?? 0) > 0)}
						{#if members.length}
							<div class="sec-h">
								<h3>From the IndieNodes webring</h3>
							</div>
							<div class="rows">
								{#each members as entry (entry.id)}
									<RingMemberCard {entry} />
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{/each}

			<div
				class="pane"
				data-pane="forums"
				role="region"
				id="pane-forums"
				aria-label="Forums"
				inert={!onForums}
				use:cardStack={{ active: onForums }}
				use:tuckMini
				onpointerdown={onPullStart}
				onpointermove={onPullMove}
				onpointerup={onPullEnd}
				onpointercancel={onPullEnd}
			>
				{#if !forums.loaded}
					<p class="empty">Loading{'…'}</p>
				{:else if forums.follows.length === 0}
					<div class="forums-empty">
						<p class="empty">
							No forums yet. Paste a link to any page of a public forum in Follow (the front page, a
							category, even one thread) to follow the forum or some of its categories.
						</p>
						<a class="forums-btn" href="/follow?mode=forums">Follow a forum</a>
					</div>
				{:else}
					{#each forums.follows.filter((follow) => follow.status !== 'ok') as follow (follow.id)}
						<p class="forum-note">
							{follow.categoryName ? `${follow.title} · ${follow.categoryName}` : follow.title}
							{follow.status === 'members-only'
								? 'is members-only now, so YipDen cannot read it.'
								: follow.status === 'gone'
									? 'is not there any more.'
									: 'could not be reached. Its topics stay until the next check.'}
						</p>
					{/each}
					<div class="forums-bar">
						<span>
							{forums.activeCount === 0 ? 'You’re caught up.' : 'Newest activity first.'}
						</span>
						{#if forums.activeCount > 0}
							<button class="forums-btn" onclick={() => forums.markAllSeen()}>Mark all read</button>
						{/if}
					</div>
					{#if forums.digest.length === 0}
						<p class="empty">
							Nothing active in the last {forums.quietDays} days. Quieter topics leave the list by themselves.
						</p>
					{:else}
						<div class="stack-list">
							{#each forums.digest as topic, index (topic.record.key)}
								<div in:fly={flyIn({ delay: staggerDelay(index) })}>
									<div class="yip-stack" data-key={topic.record.key}>
										<div class="yip-rail">
											<div class="yip-fold"><ForumTopicCard {topic} /></div>
										</div>
									</div>
								</div>
							{/each}
							<div class="stack-tail" aria-hidden="true"></div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<Toast />
</div>

{#if scopeSheetOpen}
	<FeedsFilterSheet onclose={closeScopeSheet} />
{/if}

<style>
	.feeds {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		/* The same top as Discover's bar, so the two tabs' first rows line up. */
		padding: calc(22px + env(safe-area-inset-top, 0px)) 20px 10px;
	}

	.head-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Who Feeds is narrowed to, between the switch and the filter that chose it. */
	.scope {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--brand-text);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.head-row > .scope-btn {
		margin-left: auto;
	}

	.scope-btn {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.scope-btn.is-active {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	.scope-btn svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.pill[aria-selected='true'] .new-count {
		background: #fff;
		color: var(--brand-ink);
	}

	/* The new count on Everything, where the big title used to say it. */
	.new-count {
		min-width: 20px;
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		text-align: center;
	}

	.pills {
		position: relative;
		display: flex;
		gap: 2px;
		/*
		 * Stretched to the header's full width on a phone, same as the reference prototype's own
		 * fixed mobile frame reads: each pill splits that width evenly (see `.pill`'s `flex: 1`)
		 * rather than the row hugging its own content and leaving the rest of the header empty.
		 * A wide viewport gets the opposite problem instead, one the prototype's own fixed frame
		 * never had to solve: stretched that wide, four pills of equal width look like an
		 * oversized nav bar rather than a filter. Past 600px (roughly where a phone's portrait
		 * width ends and a small tablet's begins) the row goes back to its natural, content-sized
		 * width, just centered rather than left-hugging.
		 */
		align-self: stretch;
		max-width: 100%;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	@media (min-width: 600px) {
		.pills {
			align-self: center;
		}

		.pill {
			flex: none;
		}
	}

	.ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		/* left: 0, not 4px: the transform below is driven by each pill's measured offsetLeft,
		   which already accounts for the container's padding. */
		left: 0;
		border-radius: 999px;
		background: var(--brand);
		transition:
			transform var(--dur-m) var(--ease),
			width var(--dur-m) var(--ease);
	}

	.pill {
		position: relative;
		z-index: 1;
		/* Splits `.pills`'s stretched width evenly below 600px; reverts to its own label's width
		   in the tablet media query above, where `.pills` no longer stretches at all. */
		flex: 1;
		/*
		 * 44px, not the reference prototype's 38px: touch target size is one of the brief's
		 * rules that does not bend, even where the prototype is otherwise authoritative for
		 * pixel values. See DECISIONS.md.
		 */
		height: 44px;
		padding: 0 15px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font-family: var(--body);
		font-size: 14px;
		white-space: nowrap;
		font-weight: 550;
		transition: color var(--dur-s) var(--ease);
		white-space: nowrap;
	}

	.pill[aria-selected='true'] {
		color: #fff;
	}

	/*
	 * Absolutely positioned over the pane's own top edge, not a normal-flow sibling: it used to
	 * sit between the header and .viewport, so the instant a pointer went down at the top of
	 * the scroll (pulling turning true, before any actual drag distance) its own height pushed
	 * every card down and then back up again on release. An overlay never moves anything else.
	 */
	.pull {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1;
		display: flex;
		justify-content: center;
		padding: 6px 0;
		pointer-events: none;
		transition: opacity var(--dur-s) var(--ease);
	}

	.spinner {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2.5px solid var(--line);
		border-top-color: var(--brand);
		transition: border-color var(--dur-s) var(--ease);
	}

	.pull.refreshing .spinner {
		animation: refresh-turn 0.8s linear infinite;
	}

	@keyframes refresh-turn {
		to {
			transform: rotate(360deg);
		}
	}

	.spinner.ready {
		border-top-color: var(--ok);
	}

	.viewport {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		touch-action: pan-y;
		user-select: none;
	}

	.track {
		display: flex;
		height: 100%;
		will-change: transform;
	}

	.pane {
		flex: 0 0 100%;
		height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 6px 16px calc(var(--dock) + 20px);
		transition: padding-bottom var(--dur-m) var(--ease);
		overflow-y: auto;
		/*
		 * `none`, not `contain`: the stack action reads `scrollTop` every frame, and rubber
		 * band overscroll can carry it past the pane's real bounds while bouncing back, which
		 * the top card's tip-back math reads as scrolling further than the finger actually
		 * went. Blocking the bounce here, where a transform reacts to scroll position every
		 * frame, is a narrower fix than turning it off for every scroll area in the app.
		 */
		overscroll-behavior-y: none;
		scrollbar-width: none;
		touch-action: pan-y;
	}

	.pane::-webkit-scrollbar {
		display: none;
	}

	/*
	 * Room after the last card for it to scroll all the way to the top. Without it the pane ends
	 * with the last card low on the screen and the one before it still tipping back, half hidden.
	 * Only under the card stack: a flat list (reduced motion) ends where its content ends.
	 */
	.stack-tail {
		display: none;
	}

	:global(.pane.stack) .stack-tail {
		display: block;
		flex: 0 0 auto;
		/* Sized by cardStack to the last card's own height; until then, none. */
		height: 0;
	}

	/* The cards and the tail after them, as one list: what the stack clips its rails to. */
	.stack-list {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.yip-stack {
		position: relative;
	}

	.crosspost-bar {
		display: flex;
		align-items: center;
		gap: 7px;
		min-height: 44px;
		margin-top: 4px;
		padding: 4px 8px 4px 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.crosspost-bar::-webkit-scrollbar {
		display: none;
	}

	.shelf-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 44px;
		margin-top: 4px;
		padding: 4px 8px 4px 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.shelf-label {
		color: var(--muted);
		font-family: var(--mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.shelf-btn {
		min-height: 44px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-family: var(--body);
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
	}

	.shelf-btn[aria-pressed='true'] {
		background: transparent;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.crosspost-label {
		flex: 0 0 auto;
		color: var(--muted);
		font-family: var(--mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.source-chips {
		display: flex;
		gap: 5px;
		flex: 0 0 auto;
	}

	.source-chip,
	.separate {
		min-height: 44px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 11.5px;
		font-weight: 600;
		white-space: nowrap;
	}

	.source-chip {
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.separate {
		margin-left: auto;
		background: transparent;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.empty {
		margin: 40px 4px;
		color: var(--muted);
		font-size: 14.5px;
		text-align: center;
	}

	/* Its own `display` would otherwise win over `hidden`. */
	.pills[hidden] {
		display: none;
	}

	/* People or Forums: a quiet pill above the title, the same shape as You's tabs. */
	.forums-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.forums-empty .empty {
		margin-bottom: 8px;
	}

	.forum-note {
		margin: 4px 4px 8px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-size: 13.5px;
		line-height: 1.4;
	}

	.forums-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 0 4px 10px;
		color: var(--muted);
		font-size: 13.5px;
	}

	.forums-btn {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: none;
	}

	.sec-h {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin: 10px 4px 2px;
	}

	.sec-h h3 {
		margin: 0;
		font-family: var(--display);
		font-size: 19px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	/*
	 * The 3D card stack itself is styles/card-stack.css, shared with partner rings. What is here
	 * is only Feeds' own: skipping the rendering of cards that are out of sight, on the box that is
	 * drawn (`.yip-fold`), which carries a grouped card's source bar along with the card.
	 */
	:global(.pane.stack .yip-fold) {
		content-visibility: auto;
		contain-intrinsic-size: auto 200px;
	}

	/*
	 * A listen card is 172px, not 200px (see YipCard.svelte's own `.yip.media.listen`). The
	 * Listen pane is nothing but listen cards, so that 28px overestimate compounds across every
	 * one of them into a `scrollHeight` the browser gets meaningfully wrong for any card that
	 * has not actually been rendered yet, which is exactly what content-visibility defers. That
	 * wrong total is what made "From the ring," below the last card, feel unreachable or stuck:
	 * the pane's real scrollable area was smaller than its content actually needed.
	 */
	/*
	 * A card carrying a shared video swaps it with the post like two cards in a deck, the pair
	 * swinging out past the card's own edges. Skipping its rendering would clip it to its box,
	 * as content-visibility contains its paint, so these few cards are always drawn.
	 */
	:global(.pane.stack .yip-fold:has(.has-video)) {
		content-visibility: visible;
	}

	:global(.pane.stack .yip-fold:has(.yip.listen)) {
		contain-intrinsic-size: auto 172px;
	}

	:global(.pane.stack .yip-fold:has(.crosspost-bar)) {
		contain-intrinsic-size: auto 260px;
	}

	:global(.pane.stack .yip-fold:has(.shelf-bar)) {
		contain-intrinsic-size: auto 252px;
	}

	/* No backdrop-filter on anything inside a moving card: a solid tinted chip instead. */
	:global(.pane.stack .yip .src) {
		background: color-mix(in srgb, var(--src, transparent) 78%, rgba(18, 6, 2, 0.5)) !important;
		-webkit-backdrop-filter: none !important;
		backdrop-filter: none !important;
	}
</style>
