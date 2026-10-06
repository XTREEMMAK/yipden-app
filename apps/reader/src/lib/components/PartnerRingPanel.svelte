<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flyIn } from '$lib/motion.js';
	import { hostOf } from '$lib/hosts.js';
	import { creatorProfiles } from '$lib/creatorProfile.svelte.js';
	import { previewKindOf, type PartnerRingResult, type PreviewKind } from '@yipden/ring-client';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { swipe } from '$lib/actions/swipe.js';
	import { tuckMini } from '$lib/actions/tuckMini.js';
	import { diagnostics, frameMeter, type ScrollReport } from '$lib/diagnostics.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { goto } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { explored, resumeIndex, showOf, type ExploredFilter } from '$lib/explored.svelte.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import PartnerFilterSheet from './PartnerFilterSheet.svelte';
	import { siteBrowser } from '$lib/platform/siteBrowser.svelte.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { shelf, toggleShelf } from '$lib/shelf.svelte.js';
	import { toast } from '$lib/toast.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import { celebrateLike } from '$lib/sound.js';
	import PlatformIcon from './PlatformIcon.svelte';
	import PartnerThumb from './PartnerThumb.svelte';
	import ImagePreview from './ImagePreview.svelte';
	import PreviewSheet from './PreviewSheet.svelte';
	import type { Slide } from '$lib/preview.js';

	/**
	 * One partner ring's members, on their own screen inside Discover.
	 *
	 * Never mixed into the IndieNodes rotation: this replaces the hero while it is open, names
	 * its ring on every card, and links to that ring's own hub. A member built for desktop gets
	 * Save for later as the main action, the same rule as anywhere else in Discover, and every
	 * member still links out to its own site.
	 *
	 * Cards fold and stand the same way Feeds' yips do, through the same `cardStack` action, on
	 * `.scroll`: Feeds' own split between a fixed head and a separately scrolling pane beneath
	 * it, reused here so the "back to IndieNodes" bar stays pinned while cards move under it.
	 * Reduced motion disables the stack the same way too; the action is entirely generic to
	 * what it decorates, unaware this is a different screen than Feeds.
	 */

	interface Props {
		result: PartnerRingResult;
		onback: () => void;
	}

	let { result, onback }: Props = $props();

	/** Members the reader marked not for me are not shown again, here or in any other ring. */
	let members = $derived(result.members.filter((member) => !verdicts.isHidden(member.url)));
	/** A handful of member pictures for the background, not all of them. */
	let backdrop = $derived(
		result.members.flatMap((member) => (member.thumbUrl ? [member.thumbUrl] : [])).slice(0, 12)
	);
	let hiddenCount = $derived(result.members.length - members.length);

	/*
	 * Debug builds only (see diagnostics.svelte.ts): suspects that can be switched off one at a
	 * time, and a frame meter, to find a judder on the phone that desktop profiling cannot show.
	 */
	const diag = (key: 'noStack' | 'noBackdrop' | 'noThumbs') =>
		__YIPDEN_DEBUG__ && diagnostics?.[key] === true;
	function stack(node: HTMLElement) {
		return diag('noStack') ? {} : cardStack(node);
	}
	let report = $state<ScrollReport | null>(null);
	$effect(() => {
		if (!__YIPDEN_DEBUG__ || !diagnostics?.meter || !scroller) return;
		return frameMeter(scroller, (next) => (report = next));
	});

	/**
	 * Finding someone in a ring: a search over what every ring has (name, description, address)
	 * and, for a ring that publishes categories (the `tags` capability), one chip per category.
	 * Generic over rings: nothing here knows which ring it is showing.
	 */
	// Where the reader was in this ring last time, kept across leaving Discover and relaunching:
	// applied in onMount, once it has been read.
	let query = $state('');
	let genre = $state<string | null>(null);
	let show = $state<ExploredFilter>('all');
	let filtersOpen = $state(false);
	let scroller = $state<HTMLDivElement | undefined>(undefined);

	let genres = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const member of members) {
			for (const tag of member.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		return [...counts]
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	});

	let shown = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return members.filter(
			(member) =>
				(!genre || member.tags?.includes(genre)) &&
				(show === 'all' || explored.has(member.url) === (show === 'explored')) &&
				(!needle ||
					[member.name, member.blurb, hostOf(member.url), ...(member.tags ?? [])].some((field) =>
						field?.toLowerCase().includes(needle)
					))
		);
	});

	/** "sci-fi" reads as "Sci-fi": tags arrive lowercased from the ring boundary. */
	function genreLabel(tag: string): string {
		return tag.charAt(0).toUpperCase() + tag.slice(1);
	}

	let exploredCount = $derived(members.filter((member) => explored.has(member.url)).length);

	let filtering = $derived(show !== 'all' || genre !== null);
	/** What the filter button says is on, for a screen reader: the button is an icon. */
	let filterSummary = $derived(
		[
			show === 'unexplored' ? 'not explored yet' : show === 'explored' ? 'explored' : '',
			genre ? genreLabel(genre) : ''
		]
			.filter(Boolean)
			.join(', ')
	);

	/*
	 * A changed search, genre or explored filter starts the list from the top and is remembered.
	 * The first run is the restored view itself, which keeps its own scroll position instead.
	 */
	let restored = false;
	$effect(() => {
		const view = { query, genre, show };
		if (!restored) return;
		// Untracked: setView reads the saved views it writes, and must not rerun this effect.
		untrack(() => {
			explored.setView(result.ring.id, { ...view, scrollTop: 0 });
			if (scroller) scroller.scrollTop = 0;
		});
	});

	function onScroll() {
		if (restored && scroller) explored.setView(result.ring.id, { scrollTop: scroller.scrollTop });
	}

	/** Visiting, previewing or finding feeds for someone means they were looked at. */
	function explore(member: (typeof result.members)[number]) {
		void explored.mark(member.url);
	}

	/** A member's own site: in the app when the reader allows it, where audio on it can be kept. */
	function visit(member: (typeof result.members)[number]) {
		openInBrowser(member, member.url);
	}

	/**
	 * Any page of a member's, kept in the in-app browser with that member as the creator, so audio
	 * found there (their own site or their chosen sample's page) is kept for them.
	 */
	function openInBrowser(member: (typeof result.members)[number], url: string) {
		void siteBrowser.open(
			url,
			{
				url: member.url,
				name: member.name,
				artUrl: member.thumbUrl ?? null,
				layout: creatorNotes.layoutFor(member.url, member.layout),
				ring: { source: 'partner', id: result.ring.id }
			},
			prefs.sitesInApp
		);
	}

	/** The card being swiped, and how far: only its body moves, the card itself keeps its fold. */
	let drag = $state<{ id: string; x: number } | null>(null);

	/** Swiping a card left marks it explored, or unmarks it; the check top right does the same. */
	function swipedCard(member: (typeof result.members)[number], commit: boolean) {
		drag = null;
		if (!commit) return;
		void toggleExplored(member);
		dismissHint();
	}

	const HINT_KEY = 'yipden:hint:swipeExplored';
	let showHint = $state(false);

	function dismissHint() {
		showHint = false;
		try {
			localStorage.setItem(HINT_KEY, '1');
		} catch {
			// No storage: the hint may show again next time, which is harmless.
		}
	}

	async function toggleExplored(member: (typeof result.members)[number]) {
		const now = await explored.toggle(member.url);
		toast.show(now ? `${member.name} marked explored.` : `${member.name} unmarked.`);
	}

	/** Scroll to the first member not looked at yet, after the last one that was. */
	function resume() {
		const index = resumeIndex(
			shown.map((member) => member.url),
			(url) => explored.has(url)
		);
		if (index === null || !scroller) {
			toast.show('Everyone here is explored.');
			return;
		}
		const card = scroller.querySelectorAll<HTMLElement>('.cards > li')[index];
		if (!card) return;
		// The list item, not its card: the card is the sticky box, and a pinned one reports where
		// it is drawn rather than where it sits in the list.
		const top =
			card.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
		scroller.scrollTo({ top: Math.max(0, top - 6), behavior: 'smooth' });
	}

	async function decide(member: (typeof result.members)[number], verdict: 'liked' | 'hidden') {
		const now = await verdicts.toggle(
			{
				url: member.url,
				name: member.name,
				source: 'partner',
				via: result.ring.name,
				...(member.thumbUrl ? { thumbUrl: member.thumbUrl } : {})
			},
			verdict
		);
		if (now === 'liked') {
			celebrateLike();
			toast.show(`Liked ${member.name}. Find them in You.`);
		} else if (now === 'hidden') toast.show(`${member.name} hidden. Bring them back from You.`);
	}
	/** Saved for later, from either the desktop-first main button or any card's bookmark. */
	function shelfDraft(member: (typeof result.members)[number]) {
		return {
			url: member.url,
			title: member.name,
			via: result.ring.name,
			from: 'discover' as const,
			...(member.thumbUrl ? { thumbUrl: member.thumbUrl } : {})
		};
	}

	let back = $state<HTMLButtonElement | undefined>(undefined);
	/**
	 * Rendered at this component's own root, outside `.scroll`'s stacked cards: see
	 * `PartnerThumb.svelte` for why a preview cannot be opened from inside one of those cards.
	 */
	let preview = $state<{ src: string; alt: string } | null>(null);
	/** Pictures a reader kept from a member, being read through. */
	let reading = $state<{ title: string; slides: Slide[] } | null>(null);

	/** A member's profile, carrying what the ring says of them. */
	function openProfile(member: (typeof result.members)[number]) {
		creatorProfiles.open({
			url: member.url,
			name: member.name,
			artUrl: member.thumbUrl ?? null,
			ring: { source: 'partner', id: result.ring.id },
			ringName: result.ring.name,
			layout: member.layout,
			...(member.blurb ? { blurb: member.blurb } : {})
		});
	}

	$effect(() => {
		back?.focus();
	});

	/**
	 * A real history entry lets Android Back (and the browser's) return to Discover instead of
	 * leaving the app, the same way AboutSheet and the full player do. Closing from inside the
	 * panel pops that entry; closing from elsewhere (the ring menu) drops it on unmount, unless a
	 * route change already moved past it.
	 */
	let historyOpen = false;

	onMount(() => {
		try {
			showHint = localStorage.getItem(HINT_KEY) !== '1';
		} catch {
			showHint = false;
		}
		void creatorNotes.load();
		// On a cold launch the saved view is still being read: apply it once it arrives.
		void explored.load().then(async () => {
			const view = explored.view(result.ring.id);
			query = view.query;
			genre = view.genre;
			show = showOf(view);
			await tick();
			requestAnimationFrame(() => {
				if (scroller) scroller.scrollTop = view.scrollTop;
				restored = true;
			});
		});

		// Back from a page opened above it (a creator's profile) lands on the ring's own entry, still
		// there: reuse it. Pushing a second meant one Back did nothing (phone feedback, 2026-10-06).
		if (!window.history.state?.yipdenRing) {
			window.history.pushState(
				{ ...window.history.state, yipdenRing: true },
				'',
				window.location.href
			);
		}
		historyOpen = true;

		const onPopState = () => {
			// Still on the ring's own entry: a picture opened above it was what Back closed.
			if (!historyOpen || window.history.state?.yipdenRing) return;
			historyOpen = false;
			onback();
		};
		window.addEventListener('popstate', onPopState);
		// Android can close a hidden app without warning: a scroll position waiting to be saved
		// is saved as the app goes to the background.
		const onHide = () => explored.flush();
		document.addEventListener('visibilitychange', onHide);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			explored.flush();
			window.removeEventListener('popstate', onPopState);
			if (historyOpen && window.history.state?.yipdenRing) window.history.back();
			historyOpen = false;
		};
	});

	function close() {
		if (historyOpen) window.history.back();
		else onback();
	}

	/**
	 * What the Listen button actually says, so a reader knows what they are about to open before
	 * they tap it: a file plays in a second, a platform page may ask for an account, and a
	 * paywalled one may ask for a subscription. Guessed from the URL alone, the same way
	 * `previewKindOf` itself is; nothing here changes what happens on tap, which is always the
	 * in-app browser (or the system one, where the reader turned that off), whatever the label says.
	 */
	const PREVIEW_LABELS: Record<PreviewKind, string> = {
		file: 'Listen',
		youtube: 'Watch on YouTube',
		soundcloud: 'Open on SoundCloud',
		bandcamp: 'Open on Bandcamp',
		spotify: 'Open on Spotify',
		'apple-music': 'Open on Apple Music',
		external: 'Listen'
	};

	function previewLabel(url: string): string {
		return PREVIEW_LABELS[previewKindOf(url)];
	}
</script>

<section
	class="partner"
	data-noswipe
	aria-label={`${result.ring.name} members`}
	in:fly={flyIn({ x: 40 })}
	out:fly={flyIn({ x: 40 })}
>
	<!--
		Background art: a soft mosaic of the ring's own members' pictures, dimmed under the ring's
		mark, so each ring feels like its own place. Decorative, and absent when there is none.
	-->
	{#if !diag('noBackdrop')}
		<div class="backdrop" aria-hidden="true">
			{#each backdrop as src (src)}
				<span style:background-image={`url(${CSS.escape(src)})`}></span>
			{/each}
		</div>
	{/if}
	<header class="head">
		<!-- One row: an arrow back to Discover, and the search beside it, to leave room for cards. -->
		<div class="top-row">
			<button
				bind:this={back}
				class="back"
				onclick={close}
				aria-label="Back to IndieNodes Webring"
				title="Back to IndieNodes Webring"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
			</button>
			<input
				class="search"
				type="search"
				placeholder={`Search ${members.length} members`}
				aria-label={`Search ${result.ring.name} members`}
				autocomplete="off"
				spellcheck="false"
				bind:value={query}
			/>
			<button
				class="filter-btn"
				class:is-active={filtering}
				aria-label={`Filter ${result.ring.name}${filtering ? `: ${filterSummary}` : ''}`}
				aria-haspopup="dialog"
				onclick={() => (filtersOpen = true)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
			</button>
		</div>
		<div class="ring-id">
			{#if result.ring.iconUrl}
				<img class="ring-icon" src={result.ring.iconUrl} alt="" />
			{/if}
			<h2>{result.ring.name}</h2>
			{#if result.ring.badgeUrl}
				<img class="ring-badge" src={result.ring.badgeUrl} alt={`${result.ring.name} badge`} />
			{/if}
			<button
				class="mini resume"
				onclick={resume}
				disabled={exploredCount === members.length}
				title="Jump to the next member you have not explored"
			>
				Resume
			</button>
		</div>
	</header>

	<div class="scroll" bind:this={scroller} use:stack use:tuckMini onscroll={onScroll}>
		<!--
			The intro scrolls away with the cards rather than folding out of the head: anything that
			resizes the scroller mid-fling re-lays the whole list out every frame and cuts the fling.
		-->
		<p class="note intro">
			Another ring. These members are not part of Discover’s rotation, and nothing here is ranked.
		</p>
		{#if showHint}
			<div class="hint" role="note">
				<span>Swipe a card left to mark it explored. The check at its top right does the same.</span
				>
				<button class="hint-close" onclick={dismissHint} aria-label="Got it">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			</div>
		{/if}
		<div class="stack-list">
			<ul class="cards">
				{#each shown as member (member.id)}
					{@const desktopFirst =
						creatorNotes.layoutFor(member.url, member.layout) === 'desktop-first'}
					{@const yours = creatorNotes.tracksFor(member.url)}
					{@const yourPages = creatorNotes
						.referencesFor(member.url)
						.filter(
							(entry) =>
								(entry.kind === 'image' || entry.kind === 'screenshot') && entry.status === 'live'
						)}
					{@const onShelf = shelf.has(member.url)}
					{@const seen = explored.has(member.url)}
					<li class="yip-stack">
						<div class="yip-rail">
							<div
								class="card yip-fold"
								class:seen
								use:swipe={{
									axis: 'x',
									allow: [-1],
									exclude: 'a, input',
									onMove: (delta) => (drag = { id: member.id, x: Math.min(0, delta) }),
									onEnd: (end) => swipedCard(member, end.commit)
								}}
							>
								<div
									class="swipe-reveal"
									aria-hidden="true"
									style:opacity={drag?.id === member.id ? Math.min(1, -drag.x / 80) : 0}
								>
									<svg viewBox="0 0 24 24"
										><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.3l2.6 2.6 5-5.4" /></svg
									>
									{seen ? 'Unmark' : 'Explored'}
								</div>
								<div
									class="card-body"
									class:settling={drag?.id !== member.id}
									style:transform={drag?.id === member.id ? `translateX(${drag.x}px)` : null}
								>
									<div class="via-row">
										<p class="via">
											via
											<a
												href={result.ring.hubUrl}
												target="_blank"
												rel="noopener noreferrer"
												onclick={(event) => {
													event.preventDefault();
													openExternal(result.ring.hubUrl);
												}}>{result.ring.name}</a
											>
										</p>
										<button
											class="seen-toggle"
											aria-label={seen
												? `Unmark ${member.name} as explored`
												: `Mark ${member.name} as explored`}
											title={seen ? 'Explored' : 'Mark explored'}
											aria-pressed={seen}
											onclick={() => toggleExplored(member)}
										>
											<svg viewBox="0 0 24 24" aria-hidden="true"
												><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.3l2.6 2.6 5-5.4" /></svg
											>
										</button>
									</div>
									<div class="title-row">
										{#if member.thumbUrl && !diag('noThumbs')}
											<PartnerThumb
												src={member.thumbUrl}
												alt={member.name}
												onpreview={() => (preview = { src: member.thumbUrl!, alt: member.name })}
											/>
										{/if}
										<h3>{member.name}</h3>
									</div>
									{#if member.blurb}<p class="blurb">{member.blurb}</p>{/if}
									<p class="host">
										{hostOf(member.url)}{#if desktopFirst}<span class="chip">Best on desktop</span
											>{/if}
									</p>
									<div class="acts">
										{#if desktopFirst}
											<button
												class="primary"
												aria-pressed={onShelf}
												onclick={() => toggleShelf(shelfDraft(member))}
											>
												{onShelf ? 'Saved' : 'Save for later'}
											</button>
											<button
												class="secondary"
												onclick={() => {
													explore(member);
													visit(member);
												}}
												aria-label={`Open ${hostOf(member.url)}`}
											>
												<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
													<circle cx="12" cy="12" r="9" />
													<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
												</svg>
												Open
											</button>
										{:else}
											<button
												class="primary"
												onclick={() => {
													explore(member);
													visit(member);
												}}
												aria-label={`Visit ${hostOf(member.url)}`}
											>
												<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
													<circle cx="12" cy="12" r="9" />
													<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
												</svg>
												Visit
											</button>
										{/if}
										{#if member.previewUrl}
											<button
												class="secondary"
												onclick={() => {
													explore(member);
													openInBrowser(member, member.previewUrl!);
												}}
												title="Their own chosen sample"
											>
												<PlatformIcon kind={previewKindOf(member.previewUrl)} />
												{previewLabel(member.previewUrl)}
											</button>
										{/if}
										{#if yours.length}
											<button
												class="secondary"
												onclick={(event) => {
													explore(member);
													creatorNotes.play(
														{ url: member.url, name: member.name, artUrl: member.thumbUrl ?? null },
														yours[0]!.url,
														event.currentTarget
													);
												}}
												title="A track you added yourself"
											>
												<PlatformIcon kind={previewKindOf(yours[0]!.url)} />
												Your track
											</button>
										{/if}
										{#if yourPages.length}
											<!-- Pictures you kept, read like Listen plays a track: one tap, every page. -->
											<button
												class="secondary"
												onclick={() => {
													explore(member);
													reading = {
														title: `Kept from ${member.name}`,
														slides: yourPages.map((page) => ({ image: page.url, alt: page.title }))
													};
												}}
												title="Pictures you kept from their site"
											>
												<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
													<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle
														cx="12"
														cy="12"
														r="2.8"
													/>
												</svg>
												View
											</button>
										{/if}
									</div>
									<div class="acts">
										<button
											class="secondary icon-only"
											aria-label={`Find feeds for ${member.name}`}
											title="Find feeds"
											onclick={() => {
												explore(member);
												void goto(`/follow?url=${encodeURIComponent(member.url)}`);
											}}
										>
											<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
												<circle cx="11" cy="11" r="6.5" />
												<path d="M20 20l-4.4-4.4" />
											</svg>
										</button>
										{#if !desktopFirst}
											<button
												class="secondary icon-only"
												aria-label={`Save ${member.name} for later`}
												title={onShelf ? 'Saved' : 'Save for later'}
												aria-pressed={onShelf}
												onclick={() => toggleShelf(shelfDraft(member))}
											>
												<svg
													class="globe"
													class:filled={onShelf}
													viewBox="0 0 24 24"
													aria-hidden="true"
												>
													<path d="M6 4h12v16l-6-4-6 4z" />
												</svg>
											</button>
										{/if}
										<button
											class="secondary icon-only"
											aria-label={`Like ${member.name}`}
											title="Like"
											aria-pressed={verdicts.verdictFor(member.url) === 'liked'}
											onclick={() => decide(member, 'liked')}
										>
											<svg
												class="globe"
												class:filled={verdicts.verdictFor(member.url) === 'liked'}
												viewBox="0 0 24 24"
												aria-hidden="true"
											>
												<path
													d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
												/>
											</svg>
										</button>
										<button
											class="secondary icon-only"
											aria-label={`Not for me: ${member.name}`}
											title="Not for me"
											onclick={() => decide(member, 'hidden')}
										>
											<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
												<path
													d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
												/>
												<path d="M9.6 8.6l4.8 4.8M14.4 8.6l-4.8 4.8" />
											</svg>
										</button>
										<button
											class="secondary icon-only"
											aria-label={`${member.name}'s profile`}
											title="Their profile: about them, where they are, what you kept"
											onclick={() => openProfile(member)}
										>
											<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
												<circle cx="12" cy="9" r="3.6" /><path
													d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"
												/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
			{#if !shown.length && members.length}
				<p class="hidden-note">
					Nobody here matches{query.trim() ? ` “${query.trim()}”` : ''}{genre
						? ` in ${genreLabel(genre)}`
						: ''}.
				</p>
			{/if}
			{#if hiddenCount}
				<p class="hidden-note">
					{hiddenCount} hidden as not for me. You can bring {hiddenCount === 1 ? 'them' : 'them'} back
					in You.
				</p>
			{/if}
			<div class="stack-tail" aria-hidden="true"></div>
		</div>
	</div>
</section>

{#if __YIPDEN_DEBUG__ && report}
	<p class="meter" aria-live="polite">
		{report.slow}/{report.frames} slow · worst {report.worst}ms · stack {report.stack}
	</p>
{/if}

{#if filtersOpen}
	<PartnerFilterSheet
		ringName={result.ring.name}
		{show}
		{genre}
		{genres}
		counts={{
			all: members.length,
			explored: exploredCount,
			unexplored: members.length - exploredCount
		}}
		{genreLabel}
		onshow={(next) => (show = next)}
		ongenre={(next) => (genre = next)}
		onclose={() => (filtersOpen = false)}
	/>
{/if}

{#if preview}
	<ImagePreview src={preview.src} alt={preview.alt} onclose={() => (preview = null)} />
{/if}

{#if reading}
	<PreviewSheet title={reading.title} slides={reading.slides} onclose={() => (reading = null)} />
{/if}

<style>
	.meter {
		position: fixed;
		top: calc(8px + env(safe-area-inset-top, 0px));
		right: 8px;
		z-index: 50;
		margin: 0;
		padding: 6px 10px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.8);
		color: #7cff9a;
		font-family: var(--mono);
		font-size: 12px;
		pointer-events: none;
	}

	.partner {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		background: var(--deep);
		color: #fff;
		user-select: text;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: 1fr;
		opacity: 0.16;
		filter: blur(14px) saturate(1.2);
		transform: scale(1.1);
		pointer-events: none;
	}

	.backdrop span {
		background-size: cover;
		background-position: center;
	}

	.partner > :not(.backdrop) {
		position: relative;
	}

	.ring-id {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Resume sits at the end of the ring's own row, out of the way of its name. */
	.resume {
		margin-left: auto;
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

	/* The filter sheet's door: an icon beside search, filled while any filter is on. */
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
		transition:
			background var(--dur-s) var(--ease),
			color var(--dur-s) var(--ease);
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

	.ring-icon {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		object-fit: cover;
	}

	.ring-badge {
		max-height: 31px;
		margin-left: auto;
		image-rendering: pixelated;
	}

	.head {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: calc(22px + env(safe-area-inset-top, 0px)) 20px 16px;
	}

	.top-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.back {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
	}

	.back svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.note.intro {
		margin: 0 20px 14px;
	}

	.note {
		margin: 0;
		color: rgba(255, 255, 255, 0.88);
		font-size: 13.5px;
		line-height: 1.4;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 34px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}

	/*
	 * The scrolling half of this screen, separate from `.head` so the "back to IndieNodes" bar
	 * stays pinned while cards move underneath it: the same split Feeds' own header and `.pane`
	 * already have, reused here rather than invented fresh.
	 */
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		/*
		 * 6px of top clearance, matching Feeds' own `.pane`: the stack's IntersectionObserver
		 * shrinks its root by 4px from the top (`rootMargin`) to decide when a card has scrolled
		 * past it, and a first card sitting flush against zero padding sat inside that shrunk
		 * margin at rest, with no scrolling at all, marking it "behind" and pointer-events: none
		 * permanently. Found by a real click failing, not by inspection.
		 */
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

	/*
	 * Opaque, not the translucent tint the rest of Discover's glass chips use: the stack below
	 * overlaps a receding card with the one rising to replace it, and a see-through card let the
	 * one behind it show straight through, which read as a visual glitch rather than one card
	 * passing behind another. `color-mix` over the panel's own solid background keeps the exact
	 * look the translucent version had at rest, just no longer literally see-through.
	 */
	.card {
		/* No `position` here: under the stack this box is the sticky one (styles/card-stack.css). */
		/* A grid: the body slides over a quiet "Explored" label in the same cell, no positioning. */
		display: grid;
		overflow: hidden;
		touch-action: pan-y;
		padding: 16px 18px;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: var(--r-card);
		background: color-mix(in srgb, #fff 7%, var(--deep));
	}

	.via {
		margin: 0;
		color: rgba(255, 255, 255, 0.88);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	/* A link that is a real 44px target, without looking like a button. */
	.via a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -14px 0;
		color: #fff;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	h3 {
		/* A flex item's default min-width is its own content size, which a long, hand-chosen
		   name can exceed: without this it overflows the card rather than wrapping inside it. */
		min-width: 0;
		margin: 0;
		font-family: var(--display);
		font-size: 24px;
		line-height: 1.05;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}

	.blurb {
		margin: 0;
		color: rgba(255, 255, 255, 0.9);
		font-size: 15px;
		line-height: 1.45;
	}

	.host {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: rgba(255, 255, 255, 0.82);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.05em;
	}

	.chip {
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 999px;
		font-size: 10px;
		text-transform: uppercase;
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}

	.mini {
		flex: none;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
	}

	.mini:disabled {
		opacity: 0.5;
	}

	/* Looked at already: quieter, never hidden unless the reader asks. */
	.card.seen .card-body > :not(.acts):not(.via-row) {
		opacity: 0.62;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 14px;
		padding: 10px 6px 10px 14px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		font-size: 13.5px;
		line-height: 1.35;
	}

	.hint span {
		flex: 1;
	}

	.hint-close {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: #fff;
	}

	.hint-close svg,
	.seen-toggle svg,
	.swipe-reveal svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.card-body,
	.swipe-reveal {
		grid-area: 1 / 1;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.card-body.settling {
		transition: transform var(--dur-m) var(--ease);
	}

	/*
	 * Never in the way of a tap: its opacity makes it paint above the body's buttons even while
	 * fully transparent, so it takes no pointer events at all.
	 */
	.swipe-reveal {
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding-right: 4px;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.85);
	}

	.via-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		/* The check's 44px target overlaps the card's padding rather than pushing the row down. */
		margin: -10px -10px -6px 0;
	}

	.seen-toggle {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: rgba(255, 255, 255, 0.55);
	}

	.seen-toggle[aria-pressed='true'] {
		color: #fff;
	}

	.seen-toggle[aria-pressed='true'] svg {
		fill: var(--brand);
		stroke: #fff;
	}

	.hidden-note {
		margin: 12px 16px 0;
		color: rgba(255, 255, 255, 0.7);
		font-size: 13px;
	}

	.secondary[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.3);
	}

	/*
	 * The glyphs only fill about 60% of their 24 unit box (a heart, a magnifier), so the svg is
	 * drawn much larger than the glyph looks: 25px read as no change at all from 18px.
	 */
	/* Five of these fit one row on a phone: 50px each with 8px between. */
	.icon-only {
		width: 50px;
		padding: 0;
	}

	.icon-only .globe {
		width: 32px;
		height: 32px;
		stroke-width: 1.7;
	}

	.primary,
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 48px;
		padding: 0 15px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
	}

	/* A fixed ink on white, as elsewhere on the always dark Discover. See DECISIONS.md. */
	.primary {
		background: #fff;
		color: #1f1410;
	}

	.primary[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.22);
		color: #fff;
	}

	.secondary {
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
	}

	/*
	 * The button used to spell out the host itself ("Visit example.com"), which repeated what
	 * `.host` right above it already says and, once a name can run long too, only added to the
	 * crowding. A globe reads as "this leaves the app" on its own; the word stays only to name
	 * the action, not the address.
	 */
	.globe.filled {
		fill: currentColor;
	}

	.globe {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/*
	 * The same fold and stand Feeds' own yips do: `cardStack` and styles/card-stack.css, which only
	 * ever look for `.yip-stack` inside a scrolling pane. Left out on purpose: Feeds' own
	 * `content-visibility`/`contain-intrinsic-size` pair, tuned to its cards' known fixed
	 * heights (200px, 172px for Listen, and so on). A member's card here varies with its own
	 * blurb length and how many action buttons wrap, and guessing a size for that risks the
	 * exact "stuck scrollable area" bug DECISIONS.md already records for Feeds' Listen pane, for
	 * a ring of at most a few dozen cards rather than the hundreds that optimization exists for.
	 */
	/*
	 * Room after the last card for it to scroll all the way to the top, as in Feeds: without it the
	 * list ends with the last card low on the screen and the one before it still half folded behind.
	 * Sized by cardStack; only under the stack, so a flat list (reduced motion) ends where it ends.
	 */
	.stack-tail {
		display: none;
	}

	:global(.scroll.stack) .stack-tail {
		display: block;
	}
</style>
