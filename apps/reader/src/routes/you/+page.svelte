<script lang="ts">
	import Sheet from '$components/Sheet.svelte';
	import PersonIcon from '$components/PersonIcon.svelte';
	import FrameMeter from '$components/FrameMeter.svelte';
	import { kindLabel } from '$lib/sources.js';
	import { hostOf } from '$lib/hosts.js';
	import { profileHref } from '$lib/creatorProfile.svelte.js';
	import { onMount } from 'svelte';
	import type { DiscoveredFeed } from '@yipden/feeds';
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { pullToRefresh } from '$lib/actions/pullToRefresh.js';
	import Switch from '$components/Switch.svelte';
	import Spinner from '$components/Spinner.svelte';
	import { feeds } from '$lib/feeds.svelte.js';
	import { you } from '$lib/you.svelte.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { MAX_MAX_AGE_DAYS, MIN_MAX_AGE_DAYS } from '$lib/age.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { toast } from '$lib/toast.svelte.js';
	import { autoChecksStopped, isYoutubeFlake } from '$lib/refresh.js';
	import type { Feed, FeedError } from '$lib/store/index.js';
	import Toast from '$components/Toast.svelte';
	import YouLists from '$components/YouLists.svelte';
	import FolderPicker from '$components/FolderPicker.svelte';
	import LayoutPicker from '$components/LayoutPicker.svelte';
	import Library from '$components/Library.svelte';
	import PreviewSheet from '$components/PreviewSheet.svelte';
	import type { RingEntry } from '@yipden/ring-client';
	import { openExternal } from '$lib/platform/external.js';
	import { previewFor, type Preview, type Slide } from '$lib/preview.js';
	import { ring } from '$lib/ring.svelte.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import type { Person } from '$lib/store/types.js';
	import { verdictKey, verdicts } from '$lib/verdicts.svelte.js';
	import { explored } from '$lib/explored.svelte.js';
	import { page } from '$app/state';
	import { forums } from '$lib/forums.svelte.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';

	/**
	 * You: who you follow and what you have saved. The reader's own data, not the app's
	 * configuration; Appearance, Playback and the backup/export tools live under Settings,
	 * reached from the gear icon here. See DECISIONS.md for the split.
	 */

	let confirmingId = $state<string | null>(null);
	/** Whose settings sheet is open, by person id. */
	let settingsFor = $state<string | null>(null);
	let settingsRow = $derived(
		settingsFor ? (you.rows.find((row) => row.person.id === settingsFor) ?? null) : null
	);
	let busyFeedIds = $state<Set<string>>(new Set());
	let busyPersonIds = $state<Set<string>>(new Set());
	let addingForId = $state<string | null>(null);
	let sourceInput = $state('');
	let sourceMatches = $state<DiscoveredFeed[]>([]);
	let sourceError = $state<string | null>(null);
	let sourceBusy = $state(false);
	let busySourceUrl = $state<string | null>(null);
	let confirmingSourceId = $state<string | null>(null);
	/** The dead source whose replacement form is open, if any; it shares the add form's fields. */
	let replacingFeedId = $state<string | null>(null);

	let scroll: HTMLDivElement | undefined;
	let pullY = $state(0);
	let pulling = $state(false);
	let refreshing = $state(false);
	const PULL_THRESHOLD = 64;

	onMount(() => {
		void creatorNotes.load();
		void you.load();
		void shelf.load();
		void forums.load();
		void siteFollows.load();
		// Their own picks come from the ring; a cached ring paints at once, as in Discover.
		if (!ring.all.length) void ring.load();
	});

	/**
	 * A followed person's own entry in the ring: by the entry id kept when they were followed,
	 * else by their site, for a follow made another way. Null for someone not in the ring, or who
	 * has left it; then there is simply nothing of theirs to show.
	 */
	/** The ring's entries by id and by site, built once per ring rather than searched per row. */
	let ringIndex = $derived.by(() => {
		const byId = new Map<string, RingEntry>();
		const bySite = new Map<string, RingEntry>();
		for (const entry of ring.all) {
			byId.set(entry.id, entry);
			bySite.set(verdictKey(entry.source_url), entry);
		}
		return { byId, bySite };
	});

	function ringEntryFor(person: Person): RingEntry | null {
		return (
			(person.ringId ? ringIndex.byId.get(person.ringId) : undefined) ??
			ringIndex.bySite.get(verdictKey(person.siteUrl)) ??
			null
		);
	}

	/**
	 * You's three tabs. Following is first and where You opens; a View link into the Library
	 * (`?tab=library`, or any `library=` narrowing) opens that tab instead.
	 */
	type YouTab = 'following' | 'library' | 'lists';
	const YOU_TABS: Array<{ key: YouTab; label: string }> = [
		{ key: 'following', label: 'Following' },
		{ key: 'library', label: 'Library' },
		{ key: 'lists', label: 'Liked & Not Liked' }
	];
	let tab = $state<YouTab>('following');
	$effect(() => {
		const asked = page.url.searchParams.get('tab');
		if (asked === 'following' || asked === 'library' || asked === 'lists') tab = asked;
		else if (page.url.searchParams.get('library')) tab = 'library';
	});
	const tabCounts = $derived({
		following: you.rows.length,
		library: creatorNotes.references.length + shelf.items.length,
		lists: verdicts.liked.length + verdicts.hidden.length
	});

	/** Arrow keys move between tabs, as a tablist should. */
	function onYouTabKey(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const at = YOU_TABS.findIndex((entry) => entry.key === tab);
		const step = event.key === 'ArrowRight' ? 1 : YOU_TABS.length - 1;
		tab = YOU_TABS[(at + step) % YOU_TABS.length]!.key;
		document.getElementById(`you-tab-${tab}`)?.focus();
	}

	/** Open for "Read a preview", "View artwork" or "Read a sample". */
	let picks = $state<{ title: string; slides: Slide[] } | null>(null);

	/** What they chose to show, the same way Discover shows it. */
	function openPicks(entry: RingEntry, preview: Preview, from?: HTMLElement) {
		void explored.mark(entry.source_url);
		if (preview.kind === 'play') ringPlayer.play(entry, from);
		else if (preview.kind === 'view') picks = { title: entry.creator, slides: preview.slides };
		else openExternal(preview.url);
	}

	async function onPullRefresh() {
		refreshing = true;
		try {
			await you.refreshAllFollowed();
		} finally {
			refreshing = false;
		}
	}

	async function confirmUnfollow(personId: string, name: string) {
		confirmingId = null;
		await you.unfollow(personId);
		toast.show(`Unfollowed ${name}. Their yips are gone from Feeds.`);
	}

	/** A source by where it comes from: a site's own feed is its Website here, not a Blog. */
	function feedKindLabel(kind: string): string {
		return kind === 'blog' ? 'Website' : (kindLabel(kind) ?? kind);
	}

	function asUrl(raw: string): string | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
		try {
			return new URL(withScheme).toString();
		} catch {
			return null;
		}
	}

	/** What went wrong, in words, with the status code when the site gave one. */
	function problemLabel(problem: FeedError | undefined): string {
		const code = problem?.status ? ` (${problem.status})` : '';
		switch (problem?.kind) {
			case 'offline':
				return 'Could not connect';
			case 'gone':
				return `Not found${code}; it may have moved`;
			case 'refused':
				return `The site refused access${code}`;
			case 'server':
				return `The site had a problem${code}`;
			case 'blocked':
				return "The site's robots.txt asks readers not to fetch it";
			case 'not-a-feed':
				return 'Reached, but it is not a readable feed';
			case 'unreadable':
				return 'Not read: unsafe address or too large';
			default:
				return 'Last check failed';
		}
	}

	function sourceStatus(feed: Feed): string {
		if (!feed.enabled) return 'Paused · cached yips hidden';
		if (feed.failures > 0) {
			if (isYoutubeFlake(feed)) {
				return "YouTube's feed did not answer (404), which it does at times · checking again";
			}
			const streak = autoChecksStopped(feed)
				? 'automatic checks stopped'
				: `${feed.failures} ${feed.failures === 1 ? 'failure' : 'failures'} in a row`;
			return `${problemLabel(feed.lastError)} · ${streak}`;
		}
		if (feed.lastFetchedAt) {
			return `Checked ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(feed.lastFetchedAt))}`;
		}
		return 'Not checked yet';
	}

	/**
	 * Replace is offered once waiting is unlikely to help: the address is gone or no longer a
	 * feed, or automatic checks have given up. A connection blip or a busy server is not a reason
	 * to change anything, so those only get Retry until the backoff limit.
	 */
	function suggestReplace(feed: Feed): boolean {
		if (!feed.enabled || feed.failures === 0) return false;
		// YouTube's own 404s pass: the channel has not moved.
		if (isYoutubeFlake(feed)) return false;
		const kind = feed.lastError?.kind;
		return kind === 'gone' || kind === 'not-a-feed' || autoChecksStopped(feed);
	}

	function resetSourceForm(input = '') {
		sourceInput = input;
		sourceMatches = [];
		sourceError = null;
	}

	function beginAddSource(personId: string) {
		addingForId = addingForId === personId ? null : personId;
		replacingFeedId = null;
		resetSourceForm();
	}

	/** Starts from the creator's own site, the likeliest place to find where the feed went. */
	function beginReplace(feedId: string, siteUrl: string) {
		replacingFeedId = replacingFeedId === feedId ? null : feedId;
		addingForId = null;
		resetSourceForm(siteUrl);
	}

	async function replaceSource(personId: string, feed: Feed, source: DiscoveredFeed) {
		const label = feedKindLabel(feed.kind);
		busySourceUrl = source.url;
		try {
			const result = await you.replaceSource(personId, feed.id, source);
			if (result.status === 'replaced') {
				toast.show(`${label} now reads from ${hostOf(source.url)}.`);
				replacingFeedId = null;
				resetSourceForm();
			} else if (result.status === 'failed') {
				sourceError = `${hostOf(source.url)} did not work either: ${problemLabel(result.problem).toLowerCase()}. The old address is kept.`;
			} else if (result.status === 'same-address') {
				sourceError = 'That is the address already failing. Look for where it moved to.';
			} else if (result.status === 'already-attached') {
				toast.show('That source is already attached; pause or remove the old one instead.');
			} else if (result.status === 'belongs-to-other') {
				toast.show(`That source is already attached to ${result.personName}.`);
			} else {
				toast.show('That source is no longer in your follows.');
			}
		} catch {
			toast.show('Could not replace that source.');
		} finally {
			busySourceUrl = null;
		}
	}

	async function findSources(event: SubmitEvent) {
		event.preventDefault();
		const url = asUrl(sourceInput);
		if (!url) {
			sourceError = 'Paste a feed, website, or profile link first.';
			return;
		}
		sourceBusy = true;
		sourceError = null;
		sourceMatches = [];
		try {
			const found = await you.findSources(url);
			sourceMatches = found.feeds;
			if (!found.feeds.length) {
				sourceError =
					'No readable feed was found there. Try the direct RSS, Atom, or JSON Feed address.';
			}
		} catch {
			sourceError = `Could not read ${hostOf(url)}. Check the address, or try again when you are online.`;
		} finally {
			sourceBusy = false;
		}
	}

	async function attachSource(personId: string, source: DiscoveredFeed) {
		busySourceUrl = source.url;
		try {
			const result = await you.addSource(personId, source);
			if (result.status === 'added') {
				toast.show(
					result.refresh === 'failed' || result.refresh === 'missing'
						? `${feedKindLabel(source.kind)} was added, but its first check failed.`
						: `${feedKindLabel(source.kind)} was added and checked.`
				);
				addingForId = null;
				sourceMatches = [];
				sourceInput = '';
			} else if (result.status === 'already-attached') {
				toast.show('That source is already attached to this creator.');
			} else if (result.status === 'belongs-to-other') {
				toast.show(`That source is already attached to ${result.personName}.`);
			} else {
				toast.show('That creator is no longer in your follows.');
			}
		} catch {
			toast.show('Could not save that source.');
		} finally {
			busySourceUrl = null;
		}
	}

	async function retrySource(personId: string, feedId: string, label: string) {
		busyFeedIds = new Set(busyFeedIds).add(feedId);
		try {
			const status = await you.retryFeed(personId, feedId);
			toast.show(
				status === 'failed' || status === 'missing'
					? `${label} still failed: ${problemLabel(you.rows.flatMap((row) => row.feeds).find((feed) => feed.id === feedId)?.lastError).toLowerCase()}.`
					: `${label} is healthy again.`
			);
		} catch {
			toast.show(`Could not check ${label}.`);
		} finally {
			const next = new Set(busyFeedIds);
			next.delete(feedId);
			busyFeedIds = next;
		}
	}

	async function removeManualSource(personId: string, feedId: string, label: string) {
		confirmingSourceId = null;
		if (await you.removeManualSource(personId, feedId)) {
			toast.show(`Removed ${label} and its cached yips.`);
		} else {
			toast.show(`Could not remove ${label}.`);
		}
	}

	async function setCreatorSources(personId: string, name: string, enabled: boolean) {
		busyPersonIds = new Set(busyPersonIds).add(personId);
		try {
			const changed = await you.setPersonEnabled(personId, enabled);
			toast.show(
				changed === 0
					? `${name}'s sources were already ${enabled ? 'active' : 'paused'}.`
					: `${enabled ? 'Enabled' : 'Paused'} ${changed} ${changed === 1 ? 'source' : 'sources'} for ${name}.`
			);
		} catch {
			toast.show(`Could not ${enabled ? 'enable' : 'pause'} ${name}'s sources.`);
			await you.load();
		} finally {
			const next = new Set(busyPersonIds);
			next.delete(personId);
			busyPersonIds = next;
		}
	}

	async function catchUpCreator(personId: string, name: string) {
		busyPersonIds = new Set(busyPersonIds).add(personId);
		try {
			const result = await you.refreshPerson(personId);
			toast.show(
				result.checked === 0
					? `Enable one of ${name}'s sources before checking.`
					: result.failed
						? `Checked ${result.checked} sources; ${result.failed} still failed.`
						: `Caught up with ${name}.`
			);
		} catch {
			toast.show(`Could not catch up with ${name}.`);
		} finally {
			const next = new Set(busyPersonIds);
			next.delete(personId);
			busyPersonIds = next;
		}
	}

	async function setFeedEnabled(personId: string, feedId: string, label: string, enabled: boolean) {
		busyFeedIds = new Set(busyFeedIds).add(feedId);
		try {
			const status = await you.setFeedEnabled(personId, feedId, enabled);
			if (!enabled) {
				toast.show(`${label} paused. Its cached yips are hidden.`);
			} else if (status === 'failed' || status === 'missing') {
				toast.show(`${label} is on, but could not catch up yet.`);
			} else {
				toast.show(`${label} is on and caught up.`);
			}
		} catch {
			toast.show(`Could not change ${label}.`);
			await you.load();
		} finally {
			const next = new Set(busyFeedIds);
			next.delete(feedId);
			busyFeedIds = next;
		}
	}
</script>

{#snippet sourceForm(
	inputId: string,
	label: string,
	pickLabel: string,
	onpick: (source: DiscoveredFeed) => void
)}
	<form class="source-form" onsubmit={findSources} novalidate>
		<label for={inputId}>{label}</label>
		<div class="source-field">
			<input
				id={inputId}
				type="text"
				inputmode="url"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="youtube.com/@creator"
				bind:value={sourceInput}
			/>
			<button class="source-find" type="submit" disabled={sourceBusy}>
				{sourceBusy ? 'Looking…' : 'Find'}
			</button>
		</div>
		<p class="source-note">
			Manual sources stay unverified; YipDen still checks that they are safe and readable.
		</p>
		{#if sourceError}<p class="source-error">{sourceError}</p>{/if}
		{#each sourceMatches as source (source.url)}
			<div class="source-result">
				<span>
					<b>{feedKindLabel(source.kind)}</b>
					<small>{source.title} · {hostOf(source.url)}</small>
				</span>
				<button
					class="source-find"
					type="button"
					disabled={busySourceUrl !== null}
					onclick={() => onpick(source)}
					>{busySourceUrl === source.url ? 'Checking…' : pickLabel}</button
				>
			</div>
		{/each}
	</form>
{/snippet}

<svelte:head><title>You</title></svelte:head>

<!-- Debug builds: slow frames after each scroll of You, the Library's long list included. -->
<FrameMeter target={typeof window === 'undefined' ? undefined : window} label="You" />

<div
	class="scroll"
	bind:this={scroll}
	use:pullToRefresh={{
		atTop: () => (scroll?.scrollTop ?? 0) <= 0,
		onChange: (state) => {
			pullY = state.pullY;
			pulling = state.pulling;
		},
		onRefresh: onPullRefresh
	}}
>
	{#if pulling || pullY > 0 || refreshing}
		<div class="pull" style:opacity={refreshing ? 1 : Math.min(1, pullY / PULL_THRESHOLD)}>
			<span
				class="spinner"
				class:ready={pullY >= PULL_THRESHOLD || refreshing}
				class:spinning={refreshing}
			></span>
		</div>
	{/if}

	<header class="head" in:fly={flyIn()}>
		<div class="head-copy">
			<p class="eyebrow">You {'·'} on this phone</p>
			<h2 class="screen-title">Your <em>den</em>.</h2>
			<p class="lede">Everything here lives on this phone. Reading never needs an account.</p>
		</div>
		<a class="settings-link" href="/you/settings" aria-label="Settings">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M19.4 13a7.4 7.4 0 0 0 .06-1 7.4 7.4 0 0 0-.06-1l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.4.96a7.4 7.4 0 0 0-1.7-1l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.4 7.4 0 0 0-1.7 1l-2.4-.96a.5.5 0 0 0-.6.22L2.7 8.78a.5.5 0 0 0 .12.64L4.85 11a7.4 7.4 0 0 0-.06 1 7.4 7.4 0 0 0 .06 1l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.4-.96a7.4 7.4 0 0 0 1.7 1l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.4 7.4 0 0 0 1.7-1l2.4.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64L19.4 13Z"
				/>
				<circle cx="12" cy="12" r="3" />
			</svg>
		</a>
	</header>

	<div class="groups">
		<!-- Three intents, one at a time: who you read, what you kept, whom you have judged. -->
		<div
			class="you-tabs"
			role="tablist"
			aria-label="Your den"
			tabindex="-1"
			onkeydown={onYouTabKey}
			in:fly={flyIn()}
		>
			{#each YOU_TABS as entry (entry.key)}
				<button
					id={`you-tab-${entry.key}`}
					class="you-tab"
					role="tab"
					aria-selected={tab === entry.key}
					aria-controls={`you-panel-${entry.key}`}
					tabindex={tab === entry.key ? 0 : -1}
					onclick={() => (tab = entry.key)}
				>
					{entry.label}
					<span class="count">{tabCounts[entry.key]}</span>
				</button>
			{/each}
		</div>

		{#if tab === 'library'}
			<div id="you-panel-library" role="tabpanel" aria-labelledby="you-tab-library">
				<Library />
			</div>
		{:else if tab === 'lists'}
			<div id="you-panel-lists" role="tabpanel" aria-labelledby="you-tab-lists">
				<YouLists />
			</div>
		{:else}
			<div
				id="you-panel-following"
				class="grp"
				role="tabpanel"
				aria-labelledby="you-tab-following"
				in:fly={flyIn({ delay: staggerDelay(1) })}
			>
				<h3 class="grp-h">
					Following
					<span>
						{you.rows.length}
						{you.rows.length === 1 ? 'person' : 'people'}
						{'·'}
						{you.rows.reduce((sum, row) => sum + row.feeds.length, 0)} feeds
					</span>
				</h3>
				<div class="rows">
					{#if !you.loaded}
						<p class="empty">Loading{'…'}</p>
					{:else if you.rows.length === 0}
						<p class="empty">
							You are not following anyone yet. Discover is a good place to start.
						</p>
					{:else}
						{#each you.rows as row, personIndex (row.person.id)}
							{@const entry = ringEntryFor(row.person)}
							{@const own = entry ? previewFor(entry) : null}
							<div class="follow-person">
								<div class="srow person-row">
									<a class="person-toggle" href={profileHref(row.person.siteUrl)}>
										<span
											class="av"
											style:background-image={row.person.iconUrl
												? `url(${row.person.iconUrl})`
												: ''}
										></span>
										<span class="tt">
											<b>{row.person.name}</b>
											<small>
												{row.feeds.filter((feed) => feed.enabled).length} of {row.feeds.length} sources
												active
												{'·'}
												{hostOf(row.person.siteUrl)}
											</small>
											{#if feeds.fetching.has(row.person.id)}
												<small class="fetching"><Spinner size={11} /> Fetching posts{'…'}</small>
											{/if}
										</span>
										<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"
											><path d="m9 6 6 6-6 6" /></svg
										>
									</a>
									<button
										class="picks-btn"
										aria-haspopup="dialog"
										aria-label={`Settings for ${row.person.name}`}
										onclick={() => (settingsFor = row.person.id)}
									>
										<svg class="gear" viewBox="0 0 24 24" aria-hidden="true"
											><path
												fill-rule="evenodd"
												d="M10.05 4.65 L10.29 1.74 L13.71 1.74 L13.95 4.65 L15.82 5.43 L18.05 3.54 L20.46 5.95 L18.57 8.18 L19.35 10.05 L22.26 10.29 L22.26 13.71 L19.35 13.95 L18.57 15.82 L20.46 18.05 L18.05 20.46 L15.82 18.57 L13.95 19.35 L13.71 22.26 L10.29 22.26 L10.05 19.35 L8.18 18.57 L5.95 20.46 L3.54 18.05 L5.43 15.82 L4.65 13.95 L1.74 13.71 L1.74 10.29 L4.65 10.05 L5.43 8.18 L3.54 5.95 L5.95 3.54 L8.18 5.43 Z M15.20 12 A3.2 3.2 0 1 0 8.80 12 A3.2 3.2 0 1 0 15.20 12 Z"
											/></svg
										>
									</button>
									{#if entry && own && confirmingId !== row.person.id}
										<button
											class="picks-btn"
											aria-label={`${own.label}: ${row.person.name}’s own picks`}
											onclick={(event) => openPicks(entry, own, event.currentTarget)}
										>
											<svg viewBox="0 0 24 24" aria-hidden="true">
												{#if own.kind === 'play'}
													<path d="M8 5v14l11-7z" />
												{:else if own.kind === 'view'}
													<path d="M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3" />
												{:else}
													<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />
												{/if}
											</svg>
										</button>
									{/if}
									{#if confirmingId === row.person.id}
										<span class="confirm">
											<button
												class="mini-btn danger"
												onclick={() => confirmUnfollow(row.person.id, row.person.name)}
											>
												Unfollow
											</button>
											<button class="mini-btn" onclick={() => (confirmingId = null)}>Keep</button>
										</span>
									{:else}
										<button
											class="icon-btn"
											aria-label={`Unfollow ${row.person.name}`}
											title="Unfollow"
											onclick={() => (confirmingId = row.person.id)}
										>
											<PersonIcon mark="remove" />
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
				<a class="forums-link" href="/you/sites">
					<span class="tt">
						<b>Sites</b>
						<small>
							{siteFollows.follows.length
								? `${siteFollows.follows.length} followed · ${siteFollows.activeCount} new ${siteFollows.activeCount === 1 ? 'post' : 'posts'}`
								: 'Follow a site by its feed'}
						</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
				</a>
				<!-- Forums are not people, so they are a screen of their own, one tap from here. -->
				<a class="forums-link" href="/you/forums">
					<span class="tt">
						<b>Forums</b>
						<small>
							{forums.forums.length
								? `${forums.forums.length} followed · ${forums.activeCount} active ${forums.activeCount === 1 ? 'topic' : 'topics'}`
								: 'Follow a public forum, whole or by category'}
						</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
				</a>
			</div>
		{/if}
	</div>

	<Toast />
</div>

{#if picks}
	<PreviewSheet title={picks.title} slides={picks.slides} onclose={() => (picks = null)} />
{/if}

{#if settingsRow}
	{@const row = settingsRow}
	{@const personIndex = you.rows.indexOf(settingsRow)}
	<!--
		Settings for one person, in a sheet of its own: their sources and how YipDen treats them.
		Tapping their row opens their profile instead (phone feedback, 2026-10-07); what you kept from
		them lives there, so it is not repeated here.
	-->
	<Sheet
		title={`Settings for ${row.person.name}`}
		onclose={() => (settingsFor = null)}
		historyKey="personSettings"
		maxHeight="85vh"
	>
		<div class="person-settings">
			<div class="feed-list" id={`feeds-${personIndex}`}>
				<h4 class="row-sub">Sources</h4>
				{#each row.feeds as feed, feedIndex (feed.id)}
					<div class:feed-problem={feed.failures > 0} class="feed-row">
						<span class="feed-mark" aria-hidden="true">{feedKindLabel(feed.kind).slice(0, 1)}</span>
						<span class="feed-copy">
							<b>{feedKindLabel(feed.kind)}</b>
							<small>
								{feed.title !== row.person.name ? `${feed.title} · ` : ''}
								{hostOf(feed.url)}
								{feed.provenance === 'manual' ? ' · Added manually' : ''}
							</small>
							<small class:problem={feed.failures > 0}>{sourceStatus(feed)}</small>
						</span>
						<span class="feed-actions">
							{#if feed.failures > 0 && feed.enabled}
								<button
									class="source-btn"
									disabled={busyFeedIds.has(feed.id)}
									onclick={() => retrySource(row.person.id, feed.id, feedKindLabel(feed.kind))}
									>Retry</button
								>
							{/if}
							{#if suggestReplace(feed)}
								<button
									class="source-btn"
									aria-expanded={replacingFeedId === feed.id}
									aria-label={`Replace the address for ${feedKindLabel(feed.kind)}`}
									onclick={() => beginReplace(feed.id, row.person.siteUrl)}
									>{replacingFeedId === feed.id ? 'Cancel' : 'Replace'}</button
								>
							{/if}
							{#if feed.provenance === 'manual'}
								{#if confirmingSourceId === feed.id}
									<button
										class="source-btn danger"
										onclick={() =>
											removeManualSource(row.person.id, feed.id, feedKindLabel(feed.kind))}
										>Remove</button
									>
									<button class="source-btn" onclick={() => (confirmingSourceId = null)}
										>Keep</button
									>
								{:else}
									<button class="source-btn" onclick={() => (confirmingSourceId = feed.id)}
										>Remove</button
									>
								{/if}
							{/if}
							<Switch
								id={`feed-${personIndex}-${feedIndex}`}
								label={`${feed.enabled ? 'Pause' : 'Enable'} ${feedKindLabel(feed.kind)} for ${row.person.name}`}
								checked={feed.enabled}
								disabled={busyFeedIds.has(feed.id)}
								onchange={(enabled) =>
									setFeedEnabled(row.person.id, feed.id, feedKindLabel(feed.kind), enabled)}
							/>
						</span>
					</div>
					{#if replacingFeedId === feed.id}
						{@render sourceForm(
							`replace-${personIndex}-${feedIndex}`,
							'Where it moved: a feed, website or profile link',
							'Use this',
							(source) => replaceSource(row.person.id, feed, source)
						)}
					{/if}
				{/each}
				<div class="source-manage">
					<div class="source-toolbar">
						<button
							class="source-btn"
							disabled={busyPersonIds.has(row.person.id) || !row.feeds.some((feed) => feed.enabled)}
							onclick={() => catchUpCreator(row.person.id, row.person.name)}>Check now</button
						>
						<button
							class="source-btn"
							disabled={busyPersonIds.has(row.person.id) || row.feeds.length === 0}
							onclick={() =>
								setCreatorSources(
									row.person.id,
									row.person.name,
									!row.feeds.every((feed) => feed.enabled)
								)}
						>
							{row.feeds.every((feed) => feed.enabled) ? 'Pause all' : 'Enable all'}
						</button>
					</div>
					<button class="add-source" onclick={() => beginAddSource(row.person.id)}>
						{addingForId === row.person.id ? 'Cancel' : '+ Add source'}
					</button>
					{#if addingForId === row.person.id}
						{@render sourceForm(
							`source-${personIndex}`,
							'Feed, website, or profile link',
							'Add',
							(source) => attachSource(row.person.id, source)
						)}
					{/if}
					<h4 class="row-sub">Your settings for them</h4>
					<FolderPicker
						id={`folder-${personIndex}`}
						value={row.person.folder}
						folders={you.folders}
						onchange={(folder) => you.setPersonFolder(row.person.id, folder)}
					/>
					<LayoutPicker
						id={`layout-${personIndex}`}
						creatorUrl={row.person.siteUrl}
						declared={row.person.layout}
					/>
					<div class="age-limit">
						<label for={`age-${personIndex}`}>
							Keep posts from the last
							<b>{row.person.maxAgeDays ?? prefs.maxAgeDays} days</b>
							{#if row.person.maxAgeDays === undefined}<small>(default)</small>{/if}
						</label>
						<input
							id={`age-${personIndex}`}
							type="range"
							min={MIN_MAX_AGE_DAYS}
							max={MAX_MAX_AGE_DAYS}
							value={row.person.maxAgeDays ?? prefs.maxAgeDays}
							onchange={(event) =>
								you.setPersonMaxAge(row.person.id, Number(event.currentTarget.value))}
						/>
						{#if row.person.maxAgeDays !== undefined}
							<button class="source-btn" onclick={() => you.setPersonMaxAge(row.person.id, null)}
								>Use default</button
							>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</Sheet>
{/if}

<style>
	/* Anchors the pull overlay to this scroll area rather than whatever ancestor is positioned. */
	.scroll {
		position: relative;
	}

	.pull {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1;
		display: flex;
		justify-content: center;
		padding: 10px 0 6px;
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

	.spinner.ready {
		border-top-color: var(--ok);
	}

	/* Only while the fetch itself is in flight, not during the drag: a held finger already shows
	   progress against the pull distance, so spinning it too would be motion with no new meaning
	   until the request is actually running in the background, past the point a finger can show. */
	.spinner.spinning {
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: calc(26px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.head-copy {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.settings-link {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		margin-top: 2px;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.settings-link svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 4px 16px 0;
	}

	/* You's own tabs: the same pill as the lists' tabs, sized to its labels rather than equal. */
	.you-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: -8px;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.you-tab {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background var(--dur-s) var(--ease),
			color var(--dur-s) var(--ease);
	}

	.you-tab[aria-selected='true'] {
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.you-tab .count {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
	}

	.forums-link {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 56px;
		padding: 10px 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}

	.forums-link .tt {
		flex: 1;
		min-width: 0;
	}

	.forums-link b,
	.forums-link small {
		display: block;
	}

	.forums-link small {
		color: var(--muted);
		font-size: 12.5px;
	}

	.forums-link svg {
		flex: none;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* What an open row holds, in three named parts rather than one long run. */
	.row-sub {
		margin: 14px 0 2px;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.you-tab {
			transition: none;
		}
	}

	.grp {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

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
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.empty {
		margin: 16px;
		color: var(--muted);
		font-size: 14px;
	}

	.srow {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 64px;
		box-sizing: border-box;
		padding: 10px 14px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		text-align: left;
		font: inherit;
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
	}

	/*
	 * A long follow list lays out and paints only the rows near the screen, as Feeds does with its
	 * cards: scrolling a few hundred people dropped frames on a phone (2026-10-06). The size is
	 * a collapsed row's; an open one is measured once it has been drawn.
	 */
	.follow-person {
		content-visibility: auto;
		contain-intrinsic-size: auto 64px;
	}

	.follow-person:not(:last-child) {
		border-bottom: 1px solid var(--line);
	}

	.follow-person > .srow {
		border-bottom: 0;
	}

	.person-row {
		gap: 8px;
	}

	.person-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		text-decoration: none;
		font: inherit;
	}

	.chevron {
		flex: 0 0 auto;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform var(--dur-s) var(--ease);
	}

	.feed-list {
		border-top: 1px solid var(--line);
		background: color-mix(in srgb, var(--ground) 45%, var(--surface));
	}

	.feed-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 58px;
		padding: 6px 14px 6px 24px;
		border-bottom: 1px solid var(--line);
	}

	.feed-row:last-child {
		border-bottom: 0;
	}

	.feed-mark {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-family: var(--mono);
		font-size: 12px;
		font-weight: 700;
	}

	.feed-copy {
		flex: 1;
		min-width: 0;
	}

	.feed-copy b,
	.feed-copy small {
		display: block;
	}

	.feed-copy b {
		font-size: 13.5px;
		font-weight: 600;
	}

	.feed-copy small {
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.feed-row.feed-problem {
		background: color-mix(in srgb, var(--error) 5%, transparent);
	}

	.feed-copy small.problem {
		color: var(--error);
		white-space: normal;
	}

	.feed-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
	}

	.source-btn,
	.add-source,
	.source-find {
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 12px;
		font-weight: 650;
	}

	.source-btn.danger {
		border-color: var(--error);
		background: var(--error);
		color: #fff;
	}

	.source-btn:disabled,
	.source-find:disabled {
		opacity: 0.55;
	}

	.source-toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.source-manage {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 14px 12px 24px;
	}

	.fetching {
		color: var(--brand-text);
	}

	.age-limit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		width: 100%;
		font-size: 12.5px;
	}

	.age-limit label {
		flex: 1 1 100%;
	}

	.age-limit input[type='range'] {
		flex: 1;
		accent-color: var(--brand);
	}

	.add-source {
		border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
		color: var(--brand-ink);
	}

	.source-form {
		display: flex;
		width: 100%;
		box-sizing: border-box;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.source-form > label {
		font-size: 12.5px;
		font-weight: 650;
	}

	.source-field {
		display: flex;
		gap: 8px;
	}

	.source-field input {
		min-width: 0;
		height: 44px;
		box-sizing: border-box;
		flex: 1;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
	}

	.source-field input:focus {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
	}

	.source-find {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	.source-note,
	.source-error {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.4;
	}

	.source-note {
		color: var(--muted);
	}

	.source-error {
		color: var(--error);
	}

	.source-result {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
	}

	.source-result > span {
		flex: 1;
		min-width: 0;
	}

	.source-result b,
	.source-result small {
		display: block;
	}

	.source-result b {
		font-size: 13px;
	}

	.source-result small {
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.feed-row {
			align-items: flex-start;
			flex-wrap: wrap;
		}

		.feed-actions {
			width: 100%;
			justify-content: flex-end;
			padding-left: 40px;
		}
	}

	.av {
		flex: 0 0 auto;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
	}

	.tt {
		flex: 1;
		min-width: 0;
	}

	.srow b {
		display: block;
		font-size: 15px;
		font-weight: 600;
	}

	.srow small {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	/* Their own picks, one tap from the row: the brand's round play button, as in Discover. */
	/* A round button holding only a drawing (Unfollow): quieter than the solid gear beside it. */
	.icon-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.picks-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
	}

	/* A solid gear: drawn filled, with no outline to blur its teeth into petals. */
	.picks-btn svg.gear {
		stroke: none;
	}

	.picks-btn svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.mini-btn.danger {
		background: var(--error);
		border-color: var(--error);
		color: #fff;
	}

	.confirm {
		display: flex;
		gap: 6px;
	}
</style>
