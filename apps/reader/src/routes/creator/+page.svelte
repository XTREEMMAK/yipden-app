<script lang="ts">
	import { sourceColor } from '$lib/sources.js';
	import { hostOf } from '$lib/hosts.js';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { heroImage, layoutOf, safeUrl, type RingEntry } from '@yipden/ring-client';
	import LayoutPicker from '$components/LayoutPicker.svelte';
	import ReaderFinds from '$components/ReaderFinds.svelte';
	import KeepByLink from '$components/KeepByLink.svelte';
	import ReaderTracks from '$components/ReaderTracks.svelte';
	import SamePersonSheet from '$components/SamePersonSheet.svelte';
	import Toast from '$components/Toast.svelte';
	import { resolveProfile } from '@yipden/feeds';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { creatorProfiles, placeLabel } from '$lib/creatorProfile.svelte.js';
	import { creators, HOME_LABELS, homeKindOf } from '$lib/creators.svelte.js';
	import { feeds, relativeAge, sourceLabel } from '$lib/feeds.svelte.js';
	import { followRingEntry } from '$lib/follow.js';
	import { flyIn } from '$lib/motion.js';
	import { openExternal } from '$lib/platform/external.js';
	import { siteBrowser } from '$lib/platform/siteBrowser.svelte.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { ring, washFor } from '$lib/ring.svelte.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import { store, type Feed, type Person, type StoredYip } from '$lib/store/index.js';
	import { verdictKey, verdicts } from '$lib/verdicts.svelte.js';

	/**
	 * A creator's profile: everything YipDen knows about one person, wherever it was kept. Built
	 * from what is already stored, plus their own site read once (`creatorProfile.svelte.ts`).
	 * Each piece says where it came from: their own words, the ring's, or yours.
	 */

	let site = $derived(safeUrl(page.url.searchParams.get('site') ?? '')?.toString() ?? null);
	let key = $derived(site ? creators.idFor(site) : '');
	/** Every address that is them (Creator Database, step 2), their home first. */
	let addresses = $derived(site ? creators.addressesFor(site) : []);
	let keys = $derived(new Set(addresses.map(verdictKey)));
	let home = $derived(site ? creators.homeFor(site) : null);
	let homeKind = $derived(home ? (creators.recordFor(home)?.homeKind ?? homeKindOf(home)) : null);
	let homeIsSite = $derived(homeKind === 'own-site' || homeKind === 'hosted-site');
	let hint = $derived(
		addresses.map((address) => creatorProfiles.hintFor(address)).find(Boolean) ?? null
	);
	let facts = $derived(
		home
			? (creatorProfiles.factsFor(home) ?? (site ? creatorProfiles.factsFor(site) : undefined))
			: undefined
	);
	let samePersonOpen = $state(false);

	let person = $state<Person | null>(null);
	let personFeeds = $state<Feed[]>([]);
	let recent = $state<StoredYip[]>([]);
	let loaded = $state(false);
	let following = $state(false);

	let entry = $derived<RingEntry | null>(
		ring.all.find((candidate) => keys.has(verdictKey(candidate.source_url))) ?? null
	);
	let verdict = $derived(verdicts.items.find((item) => keys.has(item.id)) ?? null);
	let references = $derived(addresses.flatMap((address) => creatorNotes.referencesFor(address)));
	/** Their other addresses with something kept under them, shown after the first's. */
	let keptElsewhere = $derived(
		addresses.filter(
			(address) =>
				verdictKey(address) !== verdictKey(site ?? '') &&
				creatorNotes.referencesFor(address).length > 0
		)
	);

	let name = $derived(
		person?.name ??
			entry?.creator ??
			hint?.name ??
			verdict?.name ??
			references.find((reference) => reference.creatorName)?.creatorName ??
			facts?.name ??
			(site ? hostOf(site) : '')
	);
	let host = $derived(home ? hostOf(home) : '');
	/** The wide picture behind the header: the ring's cover for them, else what opened this. */
	let cover = $derived((entry ? heroImage(entry) : null) ?? hint?.artUrl ?? null);
	/** Their own picture: what their site shows of them, else their icon. */
	let avatar = $derived(facts?.photoUrl ?? person?.iconUrl ?? facts?.iconUrl ?? null);
	let declared = $derived(person?.layout ?? (entry ? layoutOf(entry.layout) : hint?.layout));
	let ringOrigin = $derived(
		hint?.ring ?? (entry ? ({ source: 'own', id: 'indienodes' } as const) : null)
	);
	let creator = $derived({
		url: site ?? '',
		name,
		artUrl: cover,
		ring: ringOrigin,
		...(declared ? { layout: declared } : {})
	});

	/** Where they are: their site, the places their site names, and what you follow of them. */
	let places = $derived.by(() => {
		const rows: Array<{ url: string; label: string; kind?: string; note: string }> = [];
		const seen = new Set<string>(keys);
		for (const feed of personFeeds) {
			const k = verdictKey(feed.url);
			if (seen.has(k)) continue;
			seen.add(k);
			rows.push({
				url: feed.url,
				label: feed.title && feed.title !== name ? feed.title : placeLabel(feed.url).label,
				kind: feed.kind,
				note: feed.verified ? 'You follow it · Links back to their site' : 'You follow it'
			});
		}
		for (const feed of entry?.feeds ?? []) {
			const k = verdictKey(feed.url);
			if (seen.has(k)) continue;
			seen.add(k);
			rows.push({
				url: feed.url,
				...placeLabel(feed.url),
				note: feed.verified ? 'Listed by the ring · Verified' : 'Listed by the ring'
			});
		}
		// A profile whose feed is already listed above is the same place under another address.
		const feedUrls = new Set([...personFeeds, ...(entry?.feeds ?? [])].map((feed) => feed.url));
		for (const place of facts?.places ?? []) {
			const k = verdictKey(place.url);
			const resolved = resolveProfile(place.url);
			if (resolved.status === 'resolved' && feedUrls.has(resolved.match.feedUrl)) continue;
			if (seen.has(k)) continue;
			seen.add(k);
			rows.push({ ...place, note: 'Their site links it' });
		}
		return rows;
	});

	async function loadStored(target: string, targetKeys: ReadonlySet<string>) {
		await store.init();
		const [people, allFeeds] = await Promise.all([store.listPeople(), store.listFeeds()]);
		const found = people.find((candidate) => targetKeys.has(verdictKey(candidate.siteUrl))) ?? null;
		if (site !== target) return;
		person = found;
		following = found !== null;
		personFeeds = found ? allFeeds.filter((feed) => feed.personId === found.id) : [];
		recent = personFeeds.length
			? await store.listYips({ feedIds: personFeeds.map((feed) => feed.id), limit: 5 })
			: [];
		loaded = true;
	}

	$effect(() => {
		const target = site;
		if (!target) return;
		const targetKeys = keys;
		loaded = false;
		void loadStored(target, targetKeys);
		void creatorProfiles.read(target);
		if (home && home !== target && homeIsSite) void creatorProfiles.read(home);
	});

	onMount(() => {
		void creators.load();
		void creatorNotes.load();
		if (!verdicts.loaded) void verdicts.load();
		if (!ring.all.length) void ring.load();
	});

	function back() {
		if (history.length > 1) history.back();
		else void goto('/');
	}

	/** Their home when it is a site; a profile on a platform opens where it lives. */
	function visit() {
		const target = home ?? site;
		if (!target) return;
		if (homeIsSite) void siteBrowser.open(target, creator, prefs.sitesInApp);
		else openExternal(target);
	}

	let busy = $state(false);
	async function follow() {
		if (!site || busy) return;
		if (!entry) {
			void goto(`/follow?url=${encodeURIComponent(home ?? site)}`);
			return;
		}
		busy = true;
		try {
			const outcome = await followRingEntry(entry);
			void feeds.fetchNewFollow(
				outcome.person.id,
				outcome.feeds.map((feed) => feed.id)
			);
			void ring.refreshFollowing();
			await loadStored(site, keys);
		} finally {
			busy = false;
		}
	}

	/** Liked and Not Liked belong to creators met in a ring, which is what they filter. */
	let canJudge = $derived(Boolean(entry || hint?.ring || verdict));
	async function judge(kind: 'liked' | 'hidden') {
		if (!site) return;
		const partner = hint?.ring?.source === 'partner' || verdict?.source === 'partner';
		await verdicts.toggle(
			{
				url: site,
				name,
				source: partner ? 'partner' : 'indienodes',
				...(hint?.ringName ? { via: hint.ringName } : verdict?.via ? { via: verdict.via } : {}),
				...(cover ? { thumbUrl: cover } : {})
			},
			kind
		);
	}

	function openYip(yip: StoredYip) {
		void store.markRead([yip.key]);
		openExternal(yip.url);
	}
</script>

<svelte:head><title>{name || 'Creator'}</title></svelte:head>

<div class="scroll">
	{#if !site}
		<header class="head">
			<button class="back" onclick={back} aria-label="Back">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
			</button>
		</header>
		<p class="empty">That is not a creator’s address YipDen can open.</p>
	{:else}
		<header
			class="hero"
			style:background-image={cover ? `url(${cover})` : washFor(key)}
			in:fly={flyIn()}
		>
			<span class="hero-shade" aria-hidden="true"></span>
			<button class="back on-art" onclick={back} aria-label="Back">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
			</button>
			<div class="who">
				<span
					class="avatar"
					style:background-image={avatar ? `url(${avatar})` : ''}
					aria-hidden="true"
				>
					{#if !avatar}
						<svg viewBox="0 0 24 24"
							><circle cx="12" cy="9" r="3.6" /><path
								d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"
							/></svg
						>
					{/if}
				</span>
				<div class="who-text">
					<h1>{name}</h1>
					<p class="host">{host}</p>
					{#if homeKind && !homeIsSite}
						<p class="home-kind">{HOME_LABELS[homeKind]}</p>
					{/if}
				</div>
			</div>
			<div class="badges">
				{#if following}<span class="badge">Following</span>{/if}
				{#if entry}<span class="badge">In IndieNodes</span>{/if}
				{#if hint?.ringName && hint.ringName !== 'IndieNodes'}
					<span class="badge">In {hint.ringName}</span>
				{/if}
				{#if verdict?.verdict === 'liked'}<span class="badge">Liked</span>{/if}
				{#if verdict?.verdict === 'hidden'}<span class="badge">Not for you</span>{/if}
			</div>
		</header>

		<div class="actions" in:fly={flyIn({ delay: 40 })}>
			<button class="act primary" onclick={visit}>
				{homeIsSite || !home ? 'Visit their site' : `Open their ${placeLabel(home).label}`}
			</button>
			{#if following}
				<button class="act" onclick={() => goto('/you')}>Following</button>
			{:else}
				<button class="act" onclick={follow} disabled={busy}
					>{busy ? 'Following…' : 'Follow'}</button
				>
			{/if}
			<button class="act" onclick={() => (samePersonOpen = true)}>Same person as…</button>
			{#if canJudge}
				<button
					class="act icon"
					aria-pressed={verdict?.verdict === 'liked'}
					aria-label={verdict?.verdict === 'liked' ? `Unlike ${name}` : `Like ${name}`}
					onclick={() => judge('liked')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg
					>
				</button>
				<button
					class="act icon"
					aria-pressed={verdict?.verdict === 'hidden'}
					aria-label={verdict?.verdict === 'hidden'
						? `Show ${name} again`
						: `${name} is not for me`}
					onclick={() => judge('hidden')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			{/if}
		</div>

		<section class="block" aria-labelledby="about-h">
			<h2 id="about-h">About</h2>
			{#if facts?.bio}
				<blockquote class="bio">{facts.bio.text}</blockquote>
				<p class="from">
					{facts.bio.from === 'h-card' ? 'In their own words, from their site' : 'From their site'}
				</p>
			{/if}
			{#if entry?.why}
				<blockquote class="bio ring">{entry.why}</blockquote>
				<p class="from">Why they are in IndieNodes</p>
			{/if}
			{#if hint?.blurb}
				<blockquote class="bio ring">{hint.blurb}</blockquote>
				<p class="from">From {hint.ringName ?? 'their ring'}</p>
			{/if}
			{#if !facts?.bio && !entry?.why && !hint?.blurb}
				<p class="quiet">
					{facts === undefined
						? 'Reading their site…'
						: 'Their site does not say anything about them that YipDen can read.'}
				</p>
			{/if}
			{#if entry?.tags?.length || entry?.form}
				<div class="tags">
					{#if entry.form}<span class="tag">{entry.form}</span>{/if}
					{#each entry.tags ?? [] as tag (tag)}<span class="tag">{tag}</span>{/each}
				</div>
			{/if}
		</section>

		<section class="block" aria-labelledby="places-h">
			<h2 id="places-h">Where they are</h2>
			<div class="rows">
				<button class="row" onclick={visit}>
					<span
						class="dot"
						style:background={sourceColor(homeIsSite || !home ? 'blog' : placeLabel(home).kind)}
						aria-hidden="true"
					></span>
					<span class="row-text">
						<b>{homeIsSite || !home ? 'Their site' : placeLabel(home).label}</b>
						<small>{host} · Their home</small>
					</span>
				</button>
				{#each addresses.slice(1) as address (address)}
					{@const record = creators.recordFor(address)}
					<div class="row linked">
						<button class="row-main" onclick={() => openExternal(address)}>
							<span
								class="dot"
								style:background={sourceColor(placeLabel(address).kind ?? 'blog')}
								aria-hidden="true"
							></span>
							<span class="row-text">
								<b>{placeLabel(address).label}</b>
								<small>{hostOf(address)} · Same person, linked by you</small>
							</span>
						</button>
						<button
							class="row-act"
							aria-label={`Make ${hostOf(address)} their home`}
							onclick={() => site && creators.chooseHome(site, address)}>Home</button
						>
						{#if record && verdictKey(address) !== record.id}
							<button
								class="row-act"
								aria-label={`Unlink ${hostOf(address)}`}
								onclick={() => creators.unlink(address)}>Unlink</button
							>
						{/if}
					</div>
				{/each}
				{#each places as place (place.url)}
					<button class="row" onclick={() => openExternal(place.url)}>
						<span class="dot" style:background={sourceColor(place.kind)} aria-hidden="true"></span>
						<span class="row-text">
							<b>{place.label}</b>
							<small>{place.note}</small>
						</span>
					</button>
				{/each}
			</div>
			{#if facts === undefined}
				<p class="quiet">Looking for the places their site links…</p>
			{/if}
		</section>

		{#if recent.length}
			<section class="block" aria-labelledby="recent-h">
				<h2 id="recent-h">Lately</h2>
				<div class="rows">
					{#each recent as yip (yip.key)}
						<button class="row" class:unread={!yip.readAt} onclick={() => openYip(yip)}>
							<span class="dot" style:background={sourceColor(yip.feedKind)} aria-hidden="true"
							></span>
							<span class="row-text">
								<b>{yip.title && yip.title !== 'Untitled' ? yip.title : yip.summary}</b>
								<small>{sourceLabel(yip)} · {relativeAge(yip.publishedAt)}</small>
							</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if entry?.tracks?.length}
			<section class="block" aria-labelledby="picks-h">
				<h2 id="picks-h">Their picks for the ring</h2>
				<p class="quiet">
					{entry.tracks.length}
					{entry.tracks.length === 1 ? 'track' : 'tracks'} they chose for IndieNodes.
				</p>
				<button class="act" onclick={() => entry && ringPlayer.play(entry)}>Play their picks</button
				>
			</section>
		{/if}

		<section class="block kept" aria-labelledby="kept-h">
			<h2 id="kept-h">Kept from them</h2>
			<ReaderTracks {creator} />
			<ReaderFinds {creator} />
			{#each keptElsewhere as address (address)}
				{@const other = { ...creator, url: address }}
				<p class="kept-under">Kept under {hostOf(address)}</p>
				<ReaderTracks creator={other} />
				<ReaderFinds creator={other} />
			{/each}
			<KeepByLink {creator} id="profile-keep" />
		</section>

		<section class="block" aria-labelledby="yours-h">
			<h2 id="yours-h">Your settings for them</h2>
			<LayoutPicker id="profile-layout" creatorUrl={site} {declared} />
		</section>

		{#if loaded && !following && !entry && !references.length && !verdict}
			<p class="fine">
				YipDen keeps nothing about {name} yet. Following them, liking them or keeping something from their
				site will.
			</p>
		{/if}
	{/if}
</div>

{#if samePersonOpen && site}
	<SamePersonSheet url={site} {name} onclose={() => (samePersonOpen = false)} />
{/if}

<Toast />

<style>
	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 12px;
		min-height: 240px;
		padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 18px;
		background-size: cover;
		background-position: center;
		color: #fff;
	}

	.hero-shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.7));
	}

	.hero > :not(.hero-shade) {
		position: relative;
	}

	.head {
		padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 0;
	}

	.back {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.back.on-art {
		position: absolute;
		top: calc(16px + env(safe-area-inset-top, 0px));
		left: 16px;
		background: rgba(0, 0, 0, 0.35);
		color: #fff;
	}

	.back svg,
	.act svg,
	.avatar svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}

	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
		color: var(--brand-ink);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
	}

	.avatar svg {
		width: 32px;
		height: 32px;
	}

	.who-text {
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-family: var(--display);
		font-size: 26px;
		font-weight: 750;
		letter-spacing: -0.02em;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.host {
		margin: 2px 0 0;
		font-family: var(--mono);
		font-size: 12px;
		opacity: 0.85;
		overflow-wrap: anywhere;
	}

	.home-kind {
		margin: 4px 0 0;
		font-size: 12px;
		font-weight: 600;
		opacity: 0.9;
	}

	.row.linked {
		gap: 6px;
		padding: 0 8px 0 0;
	}

	.row-main {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		min-height: 56px;
		padding: 10px 6px 10px 14px;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.row-act {
		flex: none;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
	}

	.kept-under {
		margin: 10px 4px 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.badge {
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
		font-size: 12px;
		font-weight: 600;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 16px 20px 4px;
	}

	.act {
		display: inline-grid;
		place-items: center;
		min-height: 44px;
		padding: 0 18px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
	}

	.act.primary {
		border-color: transparent;
		background: var(--brand);
		color: #fff;
	}

	.act.icon {
		width: 44px;
		padding: 0;
	}

	.act[aria-pressed='true'] {
		border-color: transparent;
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.act[aria-pressed='true'] svg {
		fill: currentColor;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px 4px;
	}

	.block h2 {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.bio {
		margin: 0;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface);
		font-size: 15px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.bio.ring {
		border-left: 3px solid var(--brand);
	}

	.from {
		margin: -2px 0 6px 4px;
		font-size: 12px;
		color: var(--muted);
	}

	.quiet,
	.fine,
	.empty {
		margin: 0;
		font-size: 13.5px;
		color: var(--muted);
	}

	.fine,
	.empty {
		padding: 16px 20px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tag {
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-size: 12px;
		font-weight: 600;
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 10px 14px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.row:last-child {
		border-bottom: 0;
	}

	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 999px;
	}

	.row-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.row-text b {
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row.unread .row-text b {
		font-weight: 750;
	}

	.row-text small {
		font-size: 12px;
		color: var(--muted);
	}

	.block.kept {
		gap: 4px;
	}

	.scroll {
		padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
	}
</style>
