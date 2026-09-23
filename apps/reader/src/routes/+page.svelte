<script lang="ts">
	import { onMount } from 'svelte';
	import { swipe } from '$lib/actions/swipe.js';
	import { flyIn, prefersReducedMotion } from '$lib/motion.js';
	import { fly } from 'svelte/transition';
	import { ring, washFor, type RingFilterKey } from '$lib/ring.svelte.js';
	import { followRingEntry } from '$lib/follow.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';
	import HeroArt from '$components/HeroArt.svelte';
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
	/**
	 * Which way the next member's name and "why" should fly in from: -1 after `next()` (they
	 * come from the right, the same edge a left drag reveals), 1 after `prev()` (from the
	 * left), 0 for shuffle and the filter chips, which have no direction of their own.
	 */
	let navDirection = $state<-1 | 0 | 1>(0);

	onMount(() => {
		void ring.load();
	});

	function goNext() {
		navDirection = -1;
		ring.next();
	}

	function goPrev() {
		navDirection = 1;
		ring.prev();
	}

	/** The member card follows the finger, then settles whichever way the release went. */
	function onSwipeEnd(commit: boolean, direction: -1 | 0 | 1) {
		dragging = false;
		dragX = 0;
		if (!commit) return;
		if (direction < 0) goNext();
		else if (direction > 0) goPrev();
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
					? `Following ${entry.creator}. No feeds found yet, so Today will stay quiet.`
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

<section
	class="discover"
	aria-label="Discover"
	use:swipe={{
		axis: 'x',
		exclude: '[data-noswipe]',
		enabled: () => ring.visible.length > 1,
		onStart: () => (dragging = true),
		onMove: (delta) => (dragX = prefersReducedMotion() ? 0 : delta),
		onEnd: ({ commit, direction }) => onSwipeEnd(commit, direction)
	}}
>
	<HeroArt
		src={ring.heroImage}
		wash={washFor(ring.current?.id ?? 'yipden')}
		focal={ring.current?.thumb_position}
	/>
	<div class="scrim" aria-hidden="true"></div>

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
		style:transition={dragging ? 'none' : `transform var(--dur-m) var(--ease)`}
	>
		{#if ring.current}
			{#key ring.current.id}
				<div class="body-inner" in:fly={flyIn({ x: navDirection * -32 })}>
					<span class="glass-chip">
						{ring.isNodeOfTheDay
							? 'Node of the day'
							: `Ring · ${ring.position.index} / ${ring.position.total}`}
					</span>
					<h1 class="hero-name">{ring.current.creator}</h1>
					{#if ring.current.why}
						<p class="hero-why">{ring.current.why}</p>
					{/if}
					{#if where.length}
						<div class="where">
							{#each where as place (place)}<span>{place}</span>{/each}
						</div>
					{/if}
					<div class="actions">
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
						<button class="btn-glass" onclick={() => openExternal(ring.current!.source_url)}>
							Visit site
							<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
								><path d="M7 17L17 7M9 7h8v8" /></svg
							>
						</button>
					</div>
				</div>
			{/key}
		{:else if ring.status === 'loading'}
			<div class="body-inner">
				<span class="glass-chip">Loading the ring</span>
			</div>
		{:else}
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
				{ring.position.index} / {ring.position.total}{ring.filter === 'all' && !ring.shuffled
					? ' in the ring'
					: ''}
			</span>
			<span class="pn">
				<button class="round" onclick={goPrev} aria-label="Previous in the ring">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
				</button>
				<button class="round" onclick={goNext} aria-label="Next in the ring">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
				</button>
			</span>
		</div>

		<div class="chips" data-noswipe role="group" aria-label="Filter the ring">
			{#each ring.chips as chip (chip.key)}
				<button
					class="chip"
					aria-pressed={ring.filter === chip.key}
					onclick={() => {
						navDirection = 0;
						ring.setFilter(chip.key as RingFilterKey);
					}}
				>
					{chip.label}
				</button>
			{/each}
		</div>
	</div>

	<Toast />
</section>

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

	.body {
		position: relative;
		z-index: 1;
		margin-top: auto;
		will-change: transform;
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
		gap: 10px;
		margin-top: 4px;
	}

	.btn-white,
	.btn-glass {
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

	.btn-glass {
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

	.chips {
		display: flex;
		gap: 8px;
		padding: 0 20px 12px;
		overflow-x: auto;
		scrollbar-width: none;
		/* The chip row scrolls sideways, so it keeps its own gesture. */
		touch-action: pan-x;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	.chip {
		flex: 0 0 auto;
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
		font-family: var(--body);
		font-size: 14px;
		font-weight: 500;
		transition: background var(--dur-s) var(--ease);
	}

	.chip[aria-pressed='true'] {
		background: var(--brand);
	}
</style>
