<script lang="ts">
	import { onMount } from 'svelte';
	import { swipe } from '$lib/actions/swipe.js';
	import { duration, ease, flyIn, prefersReducedMotion, STAGGER_MS } from '$lib/motion.js';
	import { fade, fly } from 'svelte/transition';
	import { ring, washColorFor, washFor, type RingFilterKey } from '$lib/ring.svelte.js';
	import { heroImage } from '@yipden/ring-client';
	import { followRingEntry } from '$lib/follow.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';
	import HeroArt from '$components/HeroArt.svelte';
	import RingLoader from '$components/RingLoader.svelte';
	import PreviewSheet from '$components/PreviewSheet.svelte';
	import { previewFor } from '$lib/preview.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import { openExternal } from '$lib/platform/external.js';

	/**
	 * Discover: the ring, one member at a time, as a full bleed hero built on their own image.
	 *
	 * It has to work with no input at all, which is why it opens on the node of the day and can
	 * advance on its own, and it has to render from cache offline, which is why nothing here
	 * waits on a successful fetch before drawing something.
	 */

	let following = $state(false);
	let dragX = $state(0);
	let dragging = $state(false);
	/** Set for the frame a committed swipe lands, so the text block snaps back to centre instead
	 *  of easing there while the new text is also flying in (which read as the wrong side). */
	let snapBody = $state(false);
	/** Where the outgoing text was when a swipe let go, so its exit carries on from there. */
	let exitFrom = 0;
	/**
	 * Which way the next member's name and "why" should fly in from: -1 after `next()` (they
	 * come from the right, the same edge a left drag reveals), 1 after `prev()` (from the
	 * left), 0 for shuffle and the filter chips, which have no direction of their own. The
	 * WebGL hero reads the same value, for the same reason: the wipe travels the way the drag
	 * that triggered it went.
	 */
	let navDirection = $state<-1 | 0 | 1>(0);
	/**
	 * How far a committed swipe had already dragged, as a fraction of the viewport width, so the
	 * wipe's transition continues from exactly where the live preview left off instead of
	 * restarting from zero bend. Zero for the prev/next buttons and shuffle, which never dragged.
	 */
	let navFraction = $state(0);

	/** The photos a next or previous is about to wipe to, so they are decoded before it happens. */
	let neighbourPhotos = $derived.by(() => {
		const list = ring.visible;
		if (list.length < 2) return [];
		const at = Math.min(ring.index, list.length - 1);
		return [list[(at + 1) % list.length], list[(at - 1 + list.length) % list.length]].flatMap(
			(entry) => {
				const url = entry ? heroImage(entry) : null;
				return entry && url ? [{ url, focal: entry.thumb_position }] : [];
			}
		);
	});
	let section = $state<HTMLElement | undefined>(undefined);
	let heroArt: ReturnType<typeof HeroArt> | undefined;

	/**
	 * The filter chips used to sit as their own scrollable row above the tab bar, which read as
	 * cluttered next to the prev/next controls and only gets tighter as the ring's own taxonomy
	 * grows. A single button opens a sheet listing every option instead, same as the reference
	 * prototype's own sheets for anything with more than a couple of choices.
	 */
	let previewOpen = $state(false);
	let preview = $derived(ring.current ? previewFor(ring.current) : null);

	function runPreview() {
		const entry = ring.current;
		if (!entry || !preview) return;
		if (preview.kind === 'play') ringPlayer.play(entry);
		else if (preview.kind === 'view') previewOpen = true;
		else void openExternal(preview.url);
	}

	let filterSheetOpen = $state(false);
	let filterLabel = $derived(ring.chips.find((chip) => chip.key === ring.filter)?.label ?? 'All');
	let filterButton: HTMLButtonElement | undefined;
	let filterSheetClose = $state<HTMLButtonElement | undefined>(undefined);

	$effect(() => {
		if (filterSheetOpen) filterSheetClose?.focus();
	});

	function closeFilterSheet() {
		filterSheetOpen = false;
		filterButton?.focus();
	}

	function chooseFilter(key: RingFilterKey) {
		navDirection = 0;
		ring.setFilter(key);
		closeFilterSheet();
	}

	onMount(() => {
		void ring.load();
	});

	function goNext() {
		navDirection = -1;
		navFraction = 0;
		ring.next();
	}

	function goPrev() {
		navDirection = 1;
		navFraction = 0;
		ring.prev();
	}

	/** The member card follows the finger, then settles whichever way the release went. */
	function onSwipeEnd(commit: boolean, direction: -1 | 0 | 1, delta: number) {
		dragging = false;
		exitFrom = commit ? dragX : 0;
		dragX = 0;
		if (!commit) return;
		snapBody = true;
		setTimeout(() => (snapBody = false), 0);
		const fraction = delta / (section?.clientWidth || 1);
		if (direction < 0) {
			navDirection = -1;
			navFraction = fraction;
			ring.next();
		} else if (direction > 0) {
			navDirection = 1;
			navFraction = fraction;
			ring.prev();
		}
	}

	async function follow() {
		const entry = ring.current;
		if (!entry || following) return;

		following = true;
		try {
			const outcome = await followRingEntry(entry);
			await ring.refreshFollowing();
			const count = outcome.feeds.length;
			toast.show(
				count === 0
					? `Following ${entry.creator}. No feeds found yet, so Feeds will stay quiet.`
					: `Following ${entry.creator} in ${count} ${count === 1 ? 'place' : 'places'}.`
			);
		} catch (error) {
			toast.show(
				error instanceof Error && error.message.includes('https address')
					? 'That site could not be read.'
					: `Could not reach ${entry.creator}'s site. Try again when you are online.`
			);
		} finally {
			following = false;
		}
	}

	/** Where a member publishes, as outline chips, from the feeds the ring gave us. */
	let where = $derived.by(() => {
		const entry = ring.current;
		if (!entry) return [] as string[];
		if (entry.feeds?.length) {
			return [...new Set(entry.feeds.map((feed) => labelForFeed(feed.type)))];
		}
		// Without `feeds`, the ring only tells us what kind of work this is.
		return [entry.form ?? entry.type].map(labelForType);
	});

	/**
	 * The member's text arrives line by line, each a beat after the one above it, the way the
	 * prototype's own hero does, rather than as one block. The order is only the lines actually
	 * present, so a member with no "why" does not leave a gap in the sequence.
	 */
	let entryLines = $derived(
		[
			ring.isNodeOfTheDay ? 'chip' : null,
			'name',
			ring.current?.why ? 'why' : null,
			where.length ? 'where' : null,
			'actions'
		].filter((line): line is string => line !== null)
	);

	/** False until the first member is on screen, so opening Discover does not wait on an exit. */
	let hasShown = false;
	$effect(() => {
		if (ring.current) hasShown = true;
	});

	const exitMs = () => (prefersReducedMotion() ? duration.s : duration.m);

	/**
	 * The prototype's order: the outgoing text leaves first, toward the side the swipe went and
	 * fading as it goes, and only then does the next member arrive, line by line. Each line's delay
	 * therefore starts after the exit, and none of it waits on the very first member.
	 */
	function enter(line: string) {
		const reach = Math.round((section?.clientWidth || 390) * 0.3);
		return flyIn({
			x: navDirection * -reach,
			delay: (hasShown ? exitMs() : 0) + Math.max(0, entryLines.indexOf(line)) * STAGGER_MS
		});
	}

	/**
	 * The outgoing block's exit: from wherever the finger left it (zero for a button) out to 70% of
	 * the width in the direction of travel, fading. It is hidden from assistive technology at once
	 * so a screen reader never meets two members' names at the same time.
	 */
	function exit(node: HTMLElement) {
		node.setAttribute('aria-hidden', 'true');
		node.setAttribute('inert', '');
		let leaving = false;
		const reduced = prefersReducedMotion();
		// Consumed: a later button press has no drag to carry on from.
		const from = reduced ? 0 : exitFrom;
		exitFrom = 0;
		const to = reduced ? 0 : navDirection * Math.round((section?.clientWidth || 390) * 0.7);
		return {
			duration: exitMs(),
			easing: ease,
			// Hidden from the first instant, and unhidden only if the exit is reversed: switching
			// back to a member whose text is still leaving reuses that block, which must stop
			// being hidden when it does. Reversal is the progress returning to 1 after it left it.
			tick: (t: number) => {
				if (t < 1) leaving = true;
				else if (leaving) {
					node.removeAttribute('aria-hidden');
					node.removeAttribute('inert');
				}
			},
			css: (t: number, u: number) =>
				`transform: translateX(${from + (to - from) * u}px); opacity: ${t};`
		};
	}

	function labelForFeed(type: string): string {
		const labels: Record<string, string> = {
			rss: 'Blog',
			atom: 'Blog',
			jsonfeed: 'Blog',
			bluesky: 'Bluesky',
			mastodon: 'Mastodon',
			youtube: 'YouTube',
			podcast: 'Podcast',
			forum: 'Forum'
		};
		return labels[type] ?? type;
	}

	function labelForType(type: string): string {
		const labels: Record<string, string> = {
			music: 'Music',
			spoken: 'Spoken',
			audio: 'Audio',
			comic: 'Comics',
			text: 'Writing',
			game: 'Games',
			art: 'Art'
		};
		return labels[type] ?? type;
	}
</script>

<svelte:head><title>Discover</title></svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (filterSheetOpen && event.key === 'Escape') closeFilterSheet();
	}}
/>

<section
	class="discover"
	aria-label="Discover"
	bind:this={section}
	use:swipe={{
		axis: 'x',
		exclude: '[data-noswipe]',
		enabled: () => ring.visible.length > 1,
		onStart: () => {
			dragging = true;
			heroArt?.wake();
		},
		onMove: (delta) => {
			dragX = prefersReducedMotion() ? 0 : delta;
			heroArt?.dragPreview(delta / (section?.clientWidth || 1));
		},
		onEnd: ({ commit, direction, delta }) => {
			if (!commit) heroArt?.releasePreview();
			onSwipeEnd(commit, direction, delta);
		}
	}}
>
	<HeroArt
		bind:this={heroArt}
		src={ring.heroImage}
		wash={washFor(ring.current?.id ?? 'yipden')}
		washColor={washColorFor(ring.current?.id ?? 'yipden')}
		focal={ring.current?.thumb_position}
		direction={navDirection}
		dragFraction={navFraction}
		preload={neighbourPhotos}
	/>
	<div class="scrim" aria-hidden="true"></div>

	{#if ring.status === 'loading'}
		<div class="loading" out:fade={{ duration: prefersReducedMotion() ? 0 : duration.l }}>
			<RingLoader />
		</div>
	{/if}

	<header class="top">
		<span class="logo">
			<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
				<path
					d="M4 27V17a12 12 0 0 1 24 0v10"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
				/>
				<path d="M11 27v-6.5a5 5 0 0 1 10 0V27z" fill="currentColor" />
			</svg>
			YipDen
		</span>
		<button
			class="round"
			onclick={() => {
				navDirection = 0;
				ring.shuffle();
			}}
			aria-label="Shuffle the ring"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M3 7h3.5c2 0 3.3 1 4.3 2.6l2.4 4.8C14.2 16 15.5 17 17.5 17H21" />
				<path d="M18 14l3 3-3 3" />
				<path d="M3 17h3.5c1.2 0 2.2-.4 3-1.1" />
				<path d="M13.5 8.1c.8-.7 1.8-1.1 3-1.1H21" />
				<path d="M18 4l3 3-3 3" />
			</svg>
		</button>
	</header>

	<div
		class="body"
		style:transform="translateX({dragX}px)"
		style:transition={dragging || snapBody ? 'none' : `transform var(--dur-m) var(--ease)`}
	>
		{#if ring.current}
			{#key ring.current.id}
				<div class="body-inner" out:exit|global>
					{#if ring.isNodeOfTheDay}
						<span class="glass-chip" in:fly|global={enter('chip')}>Node of the day</span>
					{/if}
					<h1 class="hero-name" in:fly|global={enter('name')}>{ring.current.creator}</h1>
					{#if ring.current.why}
						<p class="hero-why" in:fly|global={enter('why')}>{ring.current.why}</p>
					{/if}
					{#if where.length}
						<div class="where" in:fly|global={enter('where')}>
							{#each where as place (place)}<span>{place}</span>{/each}
						</div>
					{/if}
					<div class="actions" in:fly|global={enter('actions')}>
						<button
							class="btn-white"
							class:is-on={ring.isFollowing(ring.current)}
							onclick={follow}
							disabled={following || ring.isFollowing(ring.current)}
							aria-pressed={ring.isFollowing(ring.current)}
						>
							{#if ring.isFollowing(ring.current)}
								<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
									><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
								>
								Following
							{:else if following}
								Following{'…'}
							{:else}
								<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
									><path d="M12 5v14M5 12h14" /></svg
								>
								Follow everything
							{/if}
						</button>
						{#if preview}
							<button
								class="btn-icon"
								onclick={runPreview}
								aria-label={preview.label}
								title={preview.label}
							>
								<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
									{#if preview.kind === 'play'}
										<path d="M8 5v14l11-7z" />
									{:else if preview.kind === 'link'}
										<path d="M7 17L17 7M9 7h8v8" />
									{:else}
										<path d="M4 6h16v12H4zM8 10h8M8 14h5" />
									{/if}
								</svg>
							</button>
						{/if}
						<button
							class="btn-icon"
							onclick={() => openExternal(ring.current!.source_url)}
							aria-label="Visit site"
							title="Visit site"
						>
							<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
								><path
									d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
								/></svg
							>
						</button>
					</div>
				</div>
			{/key}
		{:else if ring.status !== 'loading'}
			<div class="body-inner">
				<span class="glass-chip">Nothing to show</span>
				<h1 class="hero-name">The ring is quiet.</h1>
				<p class="hero-why">
					{ring.error
						? 'Could not reach the ring, and there is no saved copy on this phone yet.'
						: 'No members matched that filter.'}
				</p>
			</div>
		{/if}
	</div>

	<div class="bottom">
		<div class="ringnav">
			<span class="count">
				{ring.position.index} / {ring.position.total}{ring.filter !== 'all'
					? ` ${'·'} ${filterLabel}`
					: ring.shuffled
						? ` ${'·'} shuffled`
						: ''}
			</span>
			<span class="pn">
				<button class="round" onclick={goPrev} aria-label="Previous in the ring">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
				</button>
				<button class="round" onclick={goNext} aria-label="Next in the ring">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
				</button>
				<button
					bind:this={filterButton}
					class="round"
					class:is-active={ring.filter !== 'all'}
					data-noswipe
					onclick={() => (filterSheetOpen = true)}
					aria-haspopup="dialog"
					aria-expanded={filterSheetOpen}
					aria-label={ring.filter === 'all' ? 'Filter the ring' : `Filter the ring: ${filterLabel}`}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16M7 12h10M10 19h4" />
					</svg>
					{#if ring.filter !== 'all'}
						<span class="filter-dot" aria-hidden="true"></span>
					{/if}
				</button>
			</span>
		</div>
	</div>

	<Toast />
</section>

{#if filterSheetOpen}
	<button
		type="button"
		class="sheet-backdrop"
		data-noswipe
		tabindex="-1"
		aria-label="Close"
		onclick={closeFilterSheet}
		transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
	></button>
	<div
		class="filter-sheet"
		data-noswipe
		role="dialog"
		aria-modal="true"
		aria-label="Filter the ring"
		in:fly={flyIn({ y: 40 })}
		out:fly={flyIn({ y: 40 })}
	>
		<div class="sheet-head">
			<h2>Filter the ring</h2>
			<button
				bind:this={filterSheetClose}
				class="sheet-close"
				onclick={closeFilterSheet}
				aria-label="Close"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>
		<div class="sheet-list" role="radiogroup" aria-label="Filter the ring">
			{#each ring.chips as chip (chip.key)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={ring.filter === chip.key}
					onclick={() => chooseFilter(chip.key as RingFilterKey)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					{chip.label}
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if previewOpen && ring.current && preview?.kind === 'view'}
	<PreviewSheet
		title={ring.current.creator}
		slides={preview.slides}
		onclose={() => (previewOpen = false)}
	/>
{/if}

<style>
	.discover {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--deep);
		color: #fff;
		/* The horizontal gesture is ours; vertical belongs to the browser. */
		touch-action: pan-y;
		user-select: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		background: var(--scrim-hero);
	}

	.top {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: calc(22px + env(safe-area-inset-top, 0px)) 20px 0;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--display);
		font-size: 22px;
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.round {
		position: relative;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: rgba(24, 8, 3, 0.34);
		color: #fff;
		transition: background var(--dur-s) var(--ease);
	}

	.round:active {
		background: rgba(24, 8, 3, 0.55);
	}

	.round svg,
	.ic {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/*
	 * A one cell grid so the outgoing member's text and the incoming one's occupy the same place
	 * while one leaves and the other arrives, instead of stacking and pushing the layout.
	 */
	.body {
		position: relative;
		z-index: 1;
		display: grid;
		margin-top: auto;
		will-change: transform;
	}

	.body > :global(*) {
		grid-area: 1 / 1;
		align-self: end;
	}

	.loading {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}

	.body-inner {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 0 22px 16px;
	}

	.glass-chip {
		padding: 7px 11px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.hero-name {
		margin: 0;
		font-family: var(--display);
		font-size: clamp(40px, 12.5vw, 52px);
		line-height: 0.92;
		font-weight: 750;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.hero-why {
		margin: 0;
		max-width: 30ch;
		font-size: 16px;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.88);
	}

	.where {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.where span {
		padding: 5px 9px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.92);
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 4px;
	}

	.btn-white {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 8px;
		height: 52px;
		padding: 0 18px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background var(--dur-s) var(--ease),
			color var(--dur-s) var(--ease);
	}

	/*
	 * A fixed ink, not var(--ink).
	 *
	 * Discover is dark in both themes, so a token that flips with the theme puts light text on
	 * a white pill and the label all but disappears. The reference prototype has exactly this
	 * defect in dark mode; it is a contrast failure against the brief's own 4.5:1 rule, so it
	 * is fixed here rather than copied. See DECISIONS.md.
	 */
	.btn-white {
		background: #fff;
		color: #1f1410;
	}

	.btn-white.is-on {
		background: rgba(255, 255, 255, 0.22);
		color: #fff;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.btn-white:disabled {
		cursor: default;
	}

	.btn-icon {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 52px;
		height: 52px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.bottom {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: calc(var(--dock) + 2px);
		/* The dock changes height when the mini player is dismissed; ease to it, do not pop. */
		transition: padding-bottom var(--dur-m) var(--ease);
	}

	.ringnav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 20px;
	}

	.count {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.06em;
		color: rgba(255, 255, 255, 0.8);
		font-variant-numeric: tabular-nums;
	}

	.pn {
		display: flex;
		gap: 8px;
	}

	.round.is-active {
		background: var(--brand);
	}

	.filter-dot {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #fff;
		box-shadow: 0 0 0 2px var(--brand);
	}

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
		/* 44px, not a smaller icon-button size: the brief's touch target minimum applies here too. */
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

	.sheet-row {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 48px;
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

	.sheet-row[aria-checked='true'] {
		color: var(--brand);
		font-weight: 650;
	}

	.sheet-dot {
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
