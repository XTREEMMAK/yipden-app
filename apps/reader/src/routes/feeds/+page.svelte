<script lang="ts">
	import { onMount } from 'svelte';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { swipe } from '$lib/actions/swipe.js';
	import { fly } from 'svelte/transition';
	import { flyIn, prefersReducedMotion, staggerDelay } from '$lib/motion.js';
	import { buildListenQueue } from '$lib/queue.js';
	import { ring } from '$lib/ring.svelte.js';
	import { feeds, FEEDS_FILTERS, type FeedsFilterKey } from '$lib/feeds.svelte.js';
	import YipCard from '$components/YipCard.svelte';
	import RingRow from '$components/RingRow.svelte';

	/**
	 * Feeds: everything followed, merged and reverse chronological, in four panes a reader
	 * pages between by pill or by swipe. Each pane keeps its own scroll position because all
	 * four stay mounted; only the track that holds them moves.
	 */

	let filterIndex = $derived(FEEDS_FILTERS.findIndex((filter) => filter.key === feeds.filter));
	let dragX = $state(0);
	let dragging = $state(false);
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
		// feeds.filter is read so this effect reruns when the selection changes.
		void feeds.filter;
		measureIndicator();
	});

	// Pull to refresh: a vertical drag from the top of the active pane.
	let pullY = $state(0);
	let pulling = $state(false);
	let pullStartY = 0;
	let pullPointerId: number | null = null;
	const PULL_THRESHOLD = 64;

	onMount(() => {
		void feeds.loadAndCatchUp();
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
			if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000) void feeds.refresh();
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

	function onFilterSwipeEnd(commit: boolean, direction: -1 | 0 | 1) {
		dragging = false;
		dragX = 0;
		if (!commit) return;
		const next = filterIndex + direction;
		const clamped = Math.max(0, Math.min(FEEDS_FILTERS.length - 1, next));
		feeds.setFilter(FEEDS_FILTERS[clamped]!.key);
	}

	function activePane(): HTMLElement | null {
		return viewport?.querySelector(`[data-pane="${feeds.filter}"]`) ?? null;
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
		if (shouldRefresh) await feeds.refresh();
	}
</script>

<svelte:head><title>Feeds</title></svelte:head>

<div class="feeds">
	<header class="head">
		<p class="eyebrow">
			{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
		</p>
		<h2 class="screen-title">
			{feeds.unreadCount} new <em>yips</em> from {feeds.peopleCount}
			{feeds.peopleCount === 1 ? 'person' : 'people'}
		</h2>

		<div class="pills" role="tablist" aria-label="Filter yips">
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
					aria-selected={feeds.filter === filter.key}
					onclick={() => feeds.setFilter(filter.key)}
				>
					{filter.label}
				</button>
			{/each}
		</div>
	</header>

	{#if pulling || pullY > 0}
		<div class="pull" style:opacity={Math.min(1, pullY / PULL_THRESHOLD)} aria-hidden="true">
			<span class="spinner" class:ready={pullY >= PULL_THRESHOLD}></span>
		</div>
	{/if}

	<div
		class="viewport"
		bind:this={viewport}
		use:swipe={{
			axis: 'x',
			enabled: () => !pulling,
			onStart: () => (dragging = true),
			onMove: (delta) => (dragX = prefersReducedMotion() ? 0 : delta),
			onEnd: ({ commit, direction }) => onFilterSwipeEnd(commit, direction)
		}}
	>
		<div
			class="track"
			style:transform={`translateX(calc(${-filterIndex * 100}% + ${dragX}px))`}
			style:transition={dragging ? 'none' : 'transform var(--dur-m) var(--ease)'}
		>
			{#each FEEDS_FILTERS as filter (filter.key)}
				<div
					class="pane"
					data-pane={filter.key}
					role="tabpanel"
					tabindex="0"
					id="pane-{filter.key}"
					aria-labelledby="pill-{filter.key}"
					inert={feeds.filter !== filter.key}
					use:cardStack
					onpointerdown={onPullStart}
					onpointermove={onPullMove}
					onpointerup={onPullEnd}
					onpointercancel={onPullEnd}
				>
					{#if feeds.status === 'loading'}
						<p class="empty">Loading{'…'}</p>
					{:else if feeds.panes[filter.key].length === 0}
						<p class="empty">
							{filter.key === 'everything'
								? 'Nothing here yet. Follow someone to see their yips.'
								: 'Nothing here yet.'}
						</p>
					{:else}
						{#each feeds.panes[filter.key] as yip, index (yip.key)}
							<div in:fly={flyIn({ delay: staggerDelay(index) })}>
								<YipCard {yip} />
							</div>
						{/each}
					{/if}

					{#if filter.key === 'listen' && ring.all.length}
						{@const listenQueue = buildListenQueue(feeds.panes.listen, ring.all)}
						{@const tracks = ring.all.flatMap((entry) =>
							(entry.tracks ?? []).map((track) => ({ entry, track }))
						)}
						{@const ringStart = listenQueue.length - tracks.length}
						{#if tracks.length}
							<div class="sec-h">
								<h3>From the ring</h3>
								<span>ring.json {'·'} tracks</span>
							</div>
							<div class="rows">
								{#each tracks as { entry, track }, i (entry.id + track.media_url)}
									<RingRow {entry} {track} queue={listenQueue} index={ringStart + i} />
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

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
		padding: calc(20px + env(safe-area-inset-top, 0px)) 20px 14px;
	}

	.eyebrow {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.pills {
		position: relative;
		display: flex;
		gap: 2px;
		align-self: flex-start;
		max-width: 100%;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
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

	.pull {
		display: flex;
		justify-content: center;
		padding: 6px 0;
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

	.spinner.ready {
		border-top-color: var(--ok);
	}

	.viewport {
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

	.empty {
		margin: 40px 4px;
		color: var(--muted);
		font-size: 14.5px;
		text-align: center;
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

	.sec-h span {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted);
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
	 * The 3D card stack. Targets `.yip`, the class every card in YipCard.svelte carries,
	 * through `:global()` since that class belongs to a different component; nothing about
	 * stacking needed to live inside the card itself, only in the pane that lays cards out.
	 *
	 * `.stack-sda` is the scroll-driven path: a named view-timeline per card animates on the
	 * compositor with no JavaScript per frame. Plain `.stack` without it is what the rAF
	 * fallback in cardStack.ts drives by hand, so the same visual target is reached either way.
	 */
	:global(.pane.stack .yip) {
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
	:global(.pane.stack .yip.listen) {
		contain-intrinsic-size: auto 172px;
	}

	:global(.pane.stack .yip.behind) {
		pointer-events: none;
	}

	:global(.pane.stack .yip::after) {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: #120704;
		opacity: var(--dim, 0);
		pointer-events: none;
	}

	/* No backdrop-filter on anything inside a moving card: a solid tinted chip instead. */
	:global(.pane.stack .yip .src) {
		background: rgba(18, 6, 2, 0.5) !important;
		-webkit-backdrop-filter: none !important;
		backdrop-filter: none !important;
	}

	:global(.pane.stack-sda .yip) {
		view-timeline: --yip block;
		view-timeline-inset: 0px var(--dock);
		animation:
			yip-in linear both,
			yip-out linear forwards;
		animation-timeline: --yip, --yip;
		animation-range:
			entry 0% entry 100%,
			exit 0% exit 100%;
	}

	:global(.pane.stack-sda .yip::after) {
		animation: yip-dim linear forwards;
		animation-timeline: --yip;
		animation-range: exit 0% exit 100%;
	}

	@keyframes yip-in {
		from {
			transform-origin: 50% 100%;
			transform: perspective(1000px) translateY(24px) rotateX(14deg) scale(0.94);
			opacity: 0.5;
		}
		to {
			transform-origin: 50% 100%;
			transform: none;
			opacity: 1;
		}
	}

	@keyframes yip-out {
		from {
			transform-origin: 50% 0%;
			transform: none;
			opacity: 1;
		}
		to {
			transform-origin: 50% 0%;
			transform: perspective(1000px) translateY(100%) translateZ(-180px) rotateX(-10deg);
			opacity: 0;
		}
	}

	@keyframes yip-dim {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.6;
		}
	}
</style>
