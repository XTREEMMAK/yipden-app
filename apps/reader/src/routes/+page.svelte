<script lang="ts">
	import { onMount } from 'svelte';
	import { swipe } from '$lib/actions/swipe.js';
	import { pullToRefresh } from '$lib/actions/pullToRefresh.js';
	import { duration, ease, flyIn, prefersReducedMotion, STAGGER_MS } from '$lib/motion.js';
	import { fade, fly } from 'svelte/transition';
	import { ring, washColorFor, washFor, type RingFilterKey } from '$lib/ring.svelte.js';
	import { heroImage, layoutOf } from '@yipden/ring-client';
	import { followRingEntry } from '$lib/follow.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';
	import Spinner from '$components/Spinner.svelte';
	import { feeds } from '$lib/feeds.svelte.js';
	import HeroArt from '$components/HeroArt.svelte';
	import RingLoader from '$components/RingLoader.svelte';
	import PreviewSheet from '$components/PreviewSheet.svelte';
	import { previewFor } from '$lib/preview.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { partners } from '$lib/partnerRings.svelte.js';
	import { shelf, toggleShelf } from '$lib/shelf.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import PartnerRingPanel from '$components/PartnerRingPanel.svelte';

	/**
	 * Discover: the ring, one member at a time, as a full bleed hero built on their own image.
	 *
	 * It has to work with no input at all, which is why it opens on the node of the day and can
	 * advance on its own, and it has to render from cache offline, which is why nothing here
	 * waits on a successful fetch before drawing something.
	 */

	let following = $state(false);
	let fetchingCurrent = $derived(
		ring.current ? feeds.fetching.has(`ring:${ring.current.id}`) : false
	);
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

	/**
	 * A member built for a big screen is not opened inline on a phone: Save for later is the main
	 * action and following steps back to an icon. The site is still one tap away, since every yip
	 * links out, and the reader is told why the buttons are arranged this way.
	 */
	let desktopFirst = $derived(layoutOf(ring.current?.layout) === 'desktop-first');
	let onShelf = $derived(ring.current ? shelf.has(ring.current.source_url) : false);

	function saveForLater() {
		const entry = ring.current;
		if (!entry) return;
		void toggleShelf({ url: entry.source_url, title: entry.creator, from: 'discover' });
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
		// A category belongs to the IndieNodes ring, so choosing one returns to it.
		partners.select(null);
		ring.setFilter(key);
		closeFilterSheet();
	}

	/**
	 * Which ring is on screen, its own button and sheet: choosing between rings and filtering
	 * IndieNodes by category used to share one sheet, which buried the one thing raised directly
	 * as not obvious enough. A reader who has never seen a partner ring never sees this button at
	 * all, matching the same rule the sheet enforced before: no switcher until one is registered.
	 */
	let ringSheetOpen = $state(false);
	let ringButton = $state<HTMLButtonElement | undefined>(undefined);
	let ringSheetClose = $state<HTMLButtonElement | undefined>(undefined);
	let ringLabel = $derived(partners.selected?.ring.name ?? 'IndieNodes');

	$effect(() => {
		if (ringSheetOpen) ringSheetClose?.focus();
	});

	function closeRingSheet() {
		ringSheetOpen = false;
		ringButton?.focus();
	}

	function chooseRing(id: string | null) {
		navDirection = 0;
		partners.select(id);
		closeRingSheet();
	}

	/**
	 * Browsing one member at a time never needed a running count, and a reader asked for this
	 * instead: the full list of whoever the current filter leaves visible, to jump straight to
	 * one rather than stepping through them. See ROADMAP.md and DECISIONS.md.
	 */
	let membersSheetOpen = $state(false);
	let membersButton = $state<HTMLButtonElement | undefined>(undefined);
	let membersSheetClose = $state<HTMLButtonElement | undefined>(undefined);

	$effect(() => {
		if (membersSheetOpen) membersSheetClose?.focus();
	});

	function closeMembersSheet() {
		membersSheetOpen = false;
		membersButton?.focus();
	}

	function chooseMember(id: string) {
		navDirection = 0;
		ring.jumpTo(id);
		closeMembersSheet();
	}

	onMount(() => {
		void ring.load();
		void partners.load();
		void shelf.load();
	});

	// Pull to refresh: re-check the ring on screen, IndieNodes and every registered partner ring
	// alike, ignoring their own freshness windows the way a deliberate pull always should.
	let pullY = $state(0);
	let pulling = $state(false);
	let refreshingRing = $state(false);
	const PULL_THRESHOLD = 64;

	async function onPullRefresh() {
		refreshingRing = true;
		try {
			await Promise.all([ring.load(true), partners.reload()]);
		} finally {
			refreshingRing = false;
		}
	}

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

	/** Like a creator, or set them aside so they are not shown again. Both live in You. */
	async function decide(verdict: 'liked' | 'hidden') {
		const entry = ring.current;
		if (!entry) return;
		const draft = {
			url: entry.source_url,
			name: entry.creator,
			source: 'indienodes' as const,
			...(heroImage(entry) ? { thumbUrl: heroImage(entry)! } : {})
		};
		const now = await verdicts.toggle(draft, verdict);
		if (now === 'liked') toast.show(`Liked ${entry.creator}. Find them in You.`);
		else if (now === 'hidden') toast.show(`${entry.creator} hidden. Bring them back from You.`);
	}

	async function follow() {
		const entry = ring.current;
		if (!entry || following) return;

		following = true;
		try {
			const outcome = await followRingEntry(entry);
			await ring.refreshFollowing();
			void feeds.fetchNewFollow(
				outcome.person.id,
				outcome.feeds.map((feed) => feed.id)
			);
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
		const places = entry.feeds?.length
			? [...new Set(entry.feeds.map((feed) => labelForFeed(feed.type)))]
			: // Without `feeds`, the ring only tells us what kind of work this is.
				[entry.form ?? entry.type].map(labelForType);
		return desktopFirst ? [...places, 'Best on desktop'] : places;
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

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}
</script>

<svelte:head><title>Discover</title></svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			if (filterSheetOpen) closeFilterSheet();
			else if (ringSheetOpen) closeRingSheet();
			else if (membersSheetOpen) closeMembersSheet();
			return;
		}
		/*
		 * The prev/next buttons this used to be an alternative to are gone (2026-09-29; see
		 * DECISIONS.md): swipe is the only other way to move through the ring, and swipe has no
		 * keyboard equivalent at all. Without this, removing those buttons would have quietly
		 * taken keyboard and switch-access navigation away entirely, not just decluttered the
		 * screen. Guarded the same way swipe already is: no sheet open, no partner ring on screen,
		 * more than one member to move between.
		 */
		if (
			filterSheetOpen ||
			ringSheetOpen ||
			membersSheetOpen ||
			partners.selected ||
			ring.visible.length <= 1
		)
			return;
		if (event.key === 'ArrowRight') goNext();
		else if (event.key === 'ArrowLeft') goPrev();
	}}
/>

<section
	class="discover"
	aria-label="Discover"
	bind:this={section}
	use:swipe={{
		axis: 'x',
		exclude: '[data-noswipe]',
		enabled: () => ring.visible.length > 1 && !partners.selected,
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
	use:pullToRefresh={{
		atTop: () => true,
		enabled: () => !partners.selected,
		onChange: (state) => {
			pullY = state.pullY;
			pulling = state.pulling;
		},
		onRefresh: onPullRefresh
	}}
>
	{#if pulling || pullY > 0 || refreshingRing}
		<div
			class="pull"
			style:opacity={refreshingRing ? 1 : Math.min(1, pullY / PULL_THRESHOLD)}
			aria-hidden="true"
		>
			<span
				class="pull-spinner"
				class:ready={pullY >= PULL_THRESHOLD || refreshingRing}
				class:spinning={refreshingRing}
			></span>
		</div>
	{/if}

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

	<header class="top" inert={partners.selected !== null}>
		<span class="logo">
			<svg width="30" height="30" viewBox="0 0 1024 1024" aria-hidden="true">
				<path
					d="M465 2c-96.8 3.3-166 18-224.5 47.8-40.2 20.5-99.4 69.5-135.6 112.2-60.1 71-85.5 130.7-97.8 230C5 408.3 5 412 5 716.2V1024h32l.3-306.7.3-306.8 2.7-16.5C52.5 319.6 69 272.1 97.6 229.4A439 439 0 0 1 229.3 97.7c24.2-16.2 44.8-26 76.7-36.8a549 549 0 0 1 137-25.4 993 993 0 0 1 138 0c70 4.2 137.6 20.8 187.3 46.2 14.4 7.4 57.7 36.6 57.7 39 0 .6-14.9 26.7-25.3 44.1-7.6 12.8-7.8 13.4-6.1 15.3 2.6 2.9 3.6 2.5 11.5-4.9l21.4-19.4c7.7-6.9 15-13.7 16.4-15.2 1.4-1.4 3-2.6 3.5-2.6 4.1 0 52.4 51.5 50.4 53.6-.6.5-53.2 19.4-66.5 23.8l-8.3 2.8v7.1l42.8-.8 49.7-.9 7-.1 6.7 10c25 37.3 44.5 94.3 53.7 156.9 2 13.8 2.1 16.3 2.1 323.7V1024h32l-.2-320.7-.3-320.8-2.2-11.5c-1.2-6.3-3-16.7-4.3-23-7.7-41.2-26-92.7-42.1-119-1.7-2.8-3-5.2-2.8-5.4.7-.5 36.2-2.7 44.3-2.7 13.5 0 13.5-.3-1.5-11s-23.3-17.9-36.5-31.7l-9.1-9.5-14.3 5.2c-13.7 5-14.5 5-16 3.4a602 602 0 0 0-41.2-45.4l-17.7-17.7 9.2-8.3 10-9c.8-.7-5.7-9.9-7.4-10.7l-11.6-8.1c-6-4.4-12.3-8.6-14-9.4l-3-1.6-6.3 11.4-6.3 11.4-8-6.2A661 661 0 0 0 811 66.5C735.8 16 631.3-3.4 465 2m221.4 116.7c-12.7 4.5-30.7 19.9-48 40.8-11 13.4-9.6 12.6-19 10.9-49-9-104.4 7-154.8 44.4l-9.8 7.2-14.6-2a288 288 0 0 0-69.7-2.6l-10.5 1.3a330 330 0 0 0-107.2 31.8c-24.7 12.5-25.3 15.8-6.6 34.6 11 11 29.8 25.6 38.8 30.3 3.1 1.6 4 3.5 1.7 3.5S248 337.3 237 344a697 697 0 0 0-81 58c-6.3 5.3-14.2 12-17.6 14.7-8 6.7-10.5 10-10.5 13.6 0 4.7 1.3 6 15.2 16.5C190.5 482 236.3 505.4 277 515c8.6 2 10 2.2 22.5 4 26.8 3.7 61.5-3 90.2-17.4 5.1-2.5 9.5-4.6 9.8-4.6 2.3 0-1.4 14-7.7 28.8l-3.9 9.3 1.8 3.7c2.5 5 5.6 5.8 16.4 4.3l8.6-1.2 3.5 3.5c2.6 2.6 4.8 3.7 9.5 4.6 9.8 2 9.8 2 .7 10.8a199 199 0 0 1-34.9 25.2c-16 8.8-15.7 16.5 1.3 25 6.5 3.2 7.1 4 4.7 6-.8.6-3.4 4.6-6 8.8-5.1 9-14.1 18-44 44.8-66.7 59.8-102.3 106.8-123 162.4-7.4 19.7-14.5 50.3-14.5 62.2 0 4 0 4-3.1 3.4-1.8-.3-7.4-2.7-12.5-5.2-38.9-19-71.6-62.4-83.9-111.1-5-20-6.6-34.9-6.4-58.1l.2-21.3-2.4-2.5c-3.9-3.8-8.8-4.2-12.7-1C85 704.8 74 727 68 745.9q-13.6 44.3-2.9 91.3l2 8.6-3.6 3.6c-5.5 5.5-4.6 12.7 3.7 29.2a117 117 0 0 0 16.2 22.7q1.2.6-.2 2.8a15 15 0 0 0-1.2 6c0 5 3.6 9.2 16.6 19.6 29 23.1 62.1 41.7 95.4 53.5a53 53 0 0 1 13.3 5.8c-.1.5 1.2 1.2 3 1.6 15.9 3 17.8 3.8 21 8 7 9 13.4 15.8 17.8 19l4.7 3.5h500.9l2.8-2.2c5.8-4.5 9.4-18.6 7.6-29.4-1.4-7.8-3-11.3-4-9.5q-1 1.1-4-4.3a59 59 0 0 0-21.9-20.7 44 44 0 0 1-7.3-4.2c-.4-.5-1.2-5-1.9-10-4.6-33.6 2.7-100.4 18-164.2 2.7-11 11-38 12.2-39 .3-.3 2.3 2.1 4.6 5.4 7.6 10.8 17 10.5 20.2-.6 3.3-11.7 2-47.9-2.3-67-1.3-5.7-2.2-10.3-2.1-10.3l8.5 4c10.5 5 13.7 5.2 17.8.4 2.8-3 3-4 2.5-7.2-1-5.7-10.2-27.4-21.2-50.7-15.8-33.2-27.6-62-30.6-74.6-1.3-5.4-1.2-6.3 1.6-17 8.8-33.6 27.9-87 35.7-99.9a281 281 0 0 0 32-74.2c8-34.4-1.3-62.4-20.7-61.8-2.6.1-5.5.1-6.4 0-.9 0-3.9-3.3-6.6-7.4-8.7-13-13.9-29.7-16.7-53.6-4.4-38.2-10.5-51.7-35.3-77.5l-17.4-18.2a31 31 0 0 0-33.4-8.5"
					fill="currentColor"
				/>
			</svg>
			YipDen
		</span>
		<span class="top-actions">
			{#if partners.status === 'loading'}
				<span class="round is-loading" aria-hidden="true">
					<span class="mini-spinner"></span>
				</span>
			{:else if partners.rings.length}
				<button
					bind:this={ringButton}
					class="round"
					class:is-active={partners.selected !== null}
					data-noswipe
					onclick={() => (ringSheetOpen = true)}
					aria-haspopup="dialog"
					aria-expanded={ringSheetOpen}
					aria-label={`Switch ring: ${ringLabel}`}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="9.5" cy="12" r="6" />
						<circle cx="14.5" cy="12" r="6" />
					</svg>
					{#if partners.selected !== null}
						<span class="filter-dot" aria-hidden="true"></span>
					{/if}
				</button>
			{/if}
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
			{#if ring.visible.length > 1}
				<button
					bind:this={membersButton}
					class="round"
					data-noswipe
					onclick={() => (membersSheetOpen = true)}
					aria-haspopup="dialog"
					aria-expanded={membersSheetOpen}
					aria-label="Browse members"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 6h16M4 12h16M4 18h10" />
					</svg>
				</button>
			{/if}
			<button
				class="round"
				class:is-active={ring.shuffled}
				onclick={() => {
					navDirection = 0;
					if (ring.shuffled) ring.unshuffle();
					else ring.shuffle();
				}}
				aria-pressed={ring.shuffled}
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
		</span>
	</header>

	<div
		class="body"
		inert={partners.selected !== null}
		style:transform="translateX({dragX}px)"
		style:transition={dragging || snapBody ? 'none' : `transform var(--dur-m) var(--ease)`}
	>
		{#if ring.current}
			{#key ring.current.id}
				<div class="body-inner" out:exit>
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
						{#if desktopFirst}
							<button
								class="btn-white compact"
								class:is-on={onShelf}
								onclick={saveForLater}
								aria-pressed={onShelf}
							>
								{onShelf ? 'Saved' : 'Save for later'}
							</button>
							<button
								class="btn-icon"
								class:is-on={ring.isFollowing(ring.current)}
								onclick={follow}
								disabled={following || ring.isFollowing(ring.current)}
								aria-pressed={ring.isFollowing(ring.current)}
								aria-label={fetchingCurrent
									? 'Fetching posts'
									: ring.isFollowing(ring.current)
										? 'Following'
										: following
											? 'Following…'
											: 'Follow everything'}
								title="Follow everything"
							>
								{#if fetchingCurrent}
									<Spinner />
								{:else}
									<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
										{#if ring.isFollowing(ring.current)}
											<path d="M5 12.5l4.5 4.5L19 7.5" />
										{:else}
											<path d="M12 5v14M5 12h14" />
										{/if}
									</svg>
								{/if}
							</button>
						{:else}
							<button
								class="btn-white"
								class:is-on={ring.isFollowing(ring.current)}
								onclick={follow}
								disabled={following || ring.isFollowing(ring.current)}
								aria-pressed={ring.isFollowing(ring.current)}
							>
								{#if fetchingCurrent}
									<Spinner />
									Fetching posts{'…'}
								{:else if ring.isFollowing(ring.current)}
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
						{/if}
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
					<div class="verdicts" in:fly|global={enter('actions')}>
						<button
							class="chip-btn"
							class:is-on={verdicts.verdictFor(ring.current.source_url) === 'liked'}
							aria-pressed={verdicts.verdictFor(ring.current.source_url) === 'liked'}
							onclick={() => decide('liked')}
						>
							<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
								><path
									d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
								/></svg
							>
							{verdicts.verdictFor(ring.current.source_url) === 'liked' ? 'Liked' : 'Like'}
						</button>
						<button class="chip-btn" onclick={() => decide('hidden')}>
							<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"
								><path d="M6 6l12 12M18 6L6 18" /></svg
							>
							Not for me
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

	<!--
		A pure spacer now, not a control row: Filter moved up next to Shuffle, and a running node
		count gave a reader browsing one member at a time nothing useful (2026-09-30; see
		ROADMAP.md and DECISIONS.md — Browse members, next to Shuffle, replaces it). Still needed
		empty: `.body` above sits with `margin-top: auto` and relies on this element's own
		dock-clearance padding to keep the hero text clear of the tab bar.
	-->
	<div class="bottom" inert={partners.selected !== null}></div>

	{#if partners.selected}
		<PartnerRingPanel result={partners.selected} onback={() => partners.select(null)} />
	{/if}

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

{#if ringSheetOpen}
	<button
		type="button"
		class="sheet-backdrop"
		data-noswipe
		tabindex="-1"
		aria-label="Close"
		onclick={closeRingSheet}
		transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
	></button>
	<div
		class="filter-sheet"
		data-noswipe
		role="dialog"
		aria-modal="true"
		aria-label="Switch ring"
		in:fly={flyIn({ y: 40 })}
		out:fly={flyIn({ y: 40 })}
	>
		<div class="sheet-head">
			<h2>Switch ring</h2>
			<button
				bind:this={ringSheetClose}
				class="sheet-close"
				onclick={closeRingSheet}
				aria-label="Close"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>
		<div class="sheet-list" role="radiogroup" aria-label="Switch ring">
			<button
				class="sheet-row"
				role="radio"
				aria-checked={partners.selected === null}
				onclick={() => chooseRing(null)}
			>
				<span class="sheet-dot" aria-hidden="true"></span>
				IndieNodes
			</button>
			{#each partners.rings as entry (entry.ring.id)}
				<button
					class="sheet-row"
					role="radio"
					aria-checked={partners.selected?.ring.id === entry.ring.id}
					onclick={() => chooseRing(entry.ring.id)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					{entry.ring.name}
					<small class="sheet-hint">Partner ring</small>
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if membersSheetOpen}
	<button
		type="button"
		class="sheet-backdrop"
		data-noswipe
		tabindex="-1"
		aria-label="Close"
		onclick={closeMembersSheet}
		transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
	></button>
	<div
		class="filter-sheet"
		data-noswipe
		role="dialog"
		aria-modal="true"
		aria-label="Browse members"
		in:fly={flyIn({ y: 40 })}
		out:fly={flyIn({ y: 40 })}
	>
		<div class="sheet-head">
			<h2>Browse members</h2>
			<button
				bind:this={membersSheetClose}
				class="sheet-close"
				onclick={closeMembersSheet}
				aria-label="Close"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>
		<div class="sheet-list">
			{#each ring.visible as entry (entry.id)}
				<button
					class="sheet-row"
					class:is-current={ring.current?.id === entry.id}
					onclick={() => chooseMember(entry.id)}
				>
					<span class="sheet-dot" aria-hidden="true"></span>
					{entry.creator}
					<small class="sheet-hint">{hostOf(entry.source_url)}</small>
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

	.top-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.round {
		position: relative;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		/* `--deep`'s own bytes, not a hardcoded brown: this chip now tints with the chosen skin
		   the same way the hero behind it already does. See DECISIONS.md. */
		background: rgba(var(--deep-rgb), 0.34);
		color: #fff;
		transition: background var(--dur-s) var(--ease);
	}

	.round:active {
		background: rgba(var(--deep-rgb), 0.55);
	}

	/*
	 * A reader was left guessing whether the switch-ring button was simply missing, or the app
	 * was still working on something, since reading each partner ring is a real fetch of a
	 * stranger's page (see partnerRings.svelte.ts) that can take a moment on a cold launch. This
	 * fills the button's own place the instant that read starts, so "not there yet" and "still
	 * loading" never look identical.
	 */
	.round.is-loading {
		background: rgba(var(--deep-rgb), 0.34);
	}

	.mini-spinner {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.pull {
		position: absolute;
		top: env(safe-area-inset-top, 0px);
		left: 0;
		right: 0;
		z-index: 2;
		display: flex;
		justify-content: center;
		padding: 14px 0 6px;
		pointer-events: none;
		transition: opacity var(--dur-s) var(--ease);
	}

	.pull-spinner {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2.5px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		transition: border-color var(--dur-s) var(--ease);
	}

	.pull-spinner.ready {
		border-top-color: var(--ok);
	}

	.pull-spinner.spinning {
		animation: spin 0.7s linear infinite;
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

	/* Two more icon buttons share this row for a desktop first member, so the pill is tighter. */
	.btn-white.compact {
		padding: 0 16px;
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

	.verdicts {
		display: flex;
		gap: 8px;
		margin-top: 2px;
	}

	.chip-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		font-family: var(--body);
		font-size: 13.5px;
		font-weight: 600;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.chip-btn .ic {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chip-btn.is-on {
		background: rgba(255, 255, 255, 0.28);
	}

	.chip-btn.is-on .ic {
		fill: currentColor;
	}

	.btn-icon.is-on {
		background: rgba(255, 255, 255, 0.28);
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

	.sheet-hint {
		margin-left: auto;
		color: var(--muted);
		font-size: 12px;
		font-weight: 400;
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

	.sheet-row[aria-checked='true'],
	.sheet-row.is-current {
		color: var(--brand);
		font-weight: 650;
	}

	.sheet-dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		border: 2px solid var(--muted);
	}

	.sheet-row[aria-checked='true'] .sheet-dot,
	.sheet-row.is-current .sheet-dot {
		border-color: var(--brand);
		background: var(--brand);
	}
</style>
