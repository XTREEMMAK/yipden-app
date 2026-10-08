<script lang="ts">
	import { kindLabel } from '$lib/sources.js';
	import { hostOf } from '$lib/hosts.js';
	import { goto } from '$app/navigation';
	import { heroImage, type RingEntry } from '@yipden/ring-client';
	import {
		listCategories,
		probeForum,
		type DiscoveredFeed,
		type DiscoveryResult,
		type Forum,
		type ForumCategory,
		type ForumProbe
	} from '@yipden/feeds';
	import ForumPicker, { type ForumChoice } from '$components/ForumPicker.svelte';
	import { forums, namesOf } from '$lib/forums.svelte.js';
	import { siteFollows } from '$lib/siteFollows.svelte.js';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Switch from '$components/Switch.svelte';
	import Spinner from '$components/Spinner.svelte';
	import { feeds } from '$lib/feeds.svelte.js';
	import { discoverWithDeadline, DiscoveryTimeoutError } from '$lib/discovery.js';
	import { followDiscovered, followRingSelection } from '$lib/follow.js';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { ring } from '$lib/ring.svelte.js';
	import { discoveryFromRing, isExactRingMatch, searchRing } from '$lib/ringSearch.js';

	/**
	 * Follow: type a person or paste a link, see everywhere they publish, and pick what to keep.
	 *
	 * Ring matching is local and deliberately precedes web discovery. The list of found feeds is
	 * still a list the reader edits, never a list the app acts on by itself.
	 */

	type Phase =
		'idle' | 'looking' | 'results' | 'followed' | 'forum' | 'forum-followed' | 'site-followed';

	/**
	 * What is being followed is a den: a person, a site or a forum. The reader does not say which.
	 * A forum link is recognized as one; a creator in the ring or a website is a person, who can also
	 * be followed as just the posts of one feed, which is how a site is followed.
	 */
	let siteFound = $state<{ title: string; siteUrl: string; iconUrl: string | null } | null>(null);

	let phase = $state<Phase>('idle');
	let input = $state('');
	let error = $state<string | null>(null);
	let result = $state<DiscoveryResult | null>(null);
	let resultOrigin = $state<'ring' | 'web'>('web');
	let selectedRing = $state<RingEntry | null>(null);
	let ringMatches = $state<RingEntry[]>([]);
	let chosen = $state<Set<string>>(new Set());
	let busy = $state(false);
	/** A pasted link that turned out to be on a forum: what it is, and its categories once read. */
	let forumFound = $state<{
		forum: Forum;
		categories: ForumCategory[] | null;
		categoryId: number | null;
	} | null>(null);
	let forumMembersOnly = $state<Forum | null>(null);
	let forumFollowed = $state<{ title: string; count: number; whole: boolean } | null>(null);

	let personName = $derived(
		result?.title ?? (result ? hostOf(result.canonicalUrl) : 'this person')
	);
	let chosenFeeds = $derived(result?.feeds.filter((feed) => chosen.has(feed.url)) ?? []);

	onMount(() => {
		void (async () => {
			await ring.load();
			// Arrived from a link (a partner ring's "Find feeds"): fill the address in and look it
			// up, which checks the ring's own known feeds before it touches the site.
			const params = new URL(location.href).searchParams;
			const prefill = params.get('url')?.trim();
			if (prefill && phase === 'idle') {
				input = prefill;
				await runFind();
			}
		})();
	});

	$effect(() => {
		const query = input.trim();
		const entries = ring.all;
		if (phase !== 'idle' || query.length < 2) {
			ringMatches = [];
			return;
		}
		const timer = setTimeout(() => {
			ringMatches = searchRing(entries, query);
		}, 180);
		return () => clearTimeout(timer);
	});

	/** A person pastes "lenaofori.com", not "https://lenaofori.com/". Meet them there. */
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

	function useRingResult(entry: RingEntry) {
		const found = discoveryFromRing(entry);
		selectedRing = entry;
		resultOrigin = 'ring';
		result = found;
		chosen = new Set(found.feeds.filter((feed) => !feed.optional).map((feed) => feed.url));
		error = null;
		phase = 'results';
	}

	/**
	 * Whether a link is on a forum, within ten seconds: a forum is followed as a forum (whole or
	 * by category), never as a person's feed. Anything else, a slow answer included, goes on to
	 * ordinary discovery.
	 */
	async function probeWithDeadline(url: string): Promise<ForumProbe> {
		const timeout = new Promise<ForumProbe>((resolve) =>
			setTimeout(() => resolve({ status: 'not-a-forum' }), 10_000)
		);
		return Promise.race([
			probeForum(url, forums.deps().http).catch((): ForumProbe => ({ status: 'not-a-forum' })),
			timeout
		]);
	}

	async function readCategories(forum: Forum) {
		try {
			const categories = await listCategories(forum, forums.deps().http);
			if (!forumFound || forumFound.forum.baseUrl !== forum.baseUrl) return;
			if (categories === 'members-only') {
				forumMembersOnly = forum;
				forumFound = null;
			} else {
				forumFound = { ...forumFound, categories };
			}
		} catch {
			// The whole forum can still be followed; its categories just are not offered.
			if (forumFound) forumFound = { ...forumFound, categories: [] };
		}
	}

	async function followForum(choice: ForumChoice) {
		if (!forumFound || busy) return;
		busy = true;
		try {
			await forums.follow(forumFound.forum, choice, namesOf(forumFound.categories ?? []));
			forumFollowed = {
				title: forumFound.forum.title,
				whole: choice.whole,
				count: choice.whole ? 0 : choice.categories.length
			};
			phase = 'forum-followed';
		} catch {
			error = 'Could not save that follow. There may be no room left on this phone.';
		} finally {
			busy = false;
		}
	}

	async function lookupUrl(url: string) {
		error = null;
		phase = 'looking';
		result = null;
		selectedRing = null;
		resultOrigin = 'web';
		forumFound = null;
		forumMembersOnly = null;

		const probe = await probeWithDeadline(url);
		if (probe.status === 'forum') {
			forumFound = { forum: probe.forum, categories: null, categoryId: probe.categoryId };
			phase = 'forum';
			void readCategories(probe.forum);
			return;
		}
		if (probe.status === 'members-only') {
			forumMembersOnly = probe.forum;
			phase = 'forum';
			return;
		}

		try {
			const found = await discoverWithDeadline(url);
			result = found;
			chosen = new Set(found.feeds.filter((feed) => !feed.optional).map((feed) => feed.url));
			phase = 'results';
		} catch (cause) {
			phase = 'idle';
			error =
				cause instanceof DiscoveryTimeoutError
					? `Finding feeds on ${hostOf(url)} took too long. Try again when the site is responding.`
					: cause instanceof Error && cause.message.includes('https address')
						? 'That does not look like a website address.'
						: `Could not read ${hostOf(url)}. Check the address, or try again when you are online.`;
		}
	}

	/** The posts of one feed, as a site's den, without making its owner a person. */
	async function followPostsOnly() {
		const feed = chosenFeeds[0];
		if (!result || !feed || busy) return;
		busy = true;
		try {
			const title = result.title ?? hostOf(result.canonicalUrl);
			await siteFollows.follow({
				siteUrl: result.canonicalUrl,
				feedUrl: feed.url,
				title,
				iconUrl: result.iconUrl ?? null
			});
			siteFound = { title, siteUrl: result.canonicalUrl, iconUrl: result.iconUrl ?? null };
			phase = 'site-followed';
		} catch {
			error = 'Could not save that follow. There may be no room left on this phone.';
		} finally {
			busy = false;
		}
	}

	async function find(event: SubmitEvent) {
		event.preventDefault();
		await runFind();
	}

	async function runFind() {
		const localMatches = searchRing(ring.all, input, 2);
		const local =
			localMatches.find((entry) => isExactRingMatch(entry, input)) ??
			(localMatches.length === 1 ? localMatches[0] : undefined);
		if (local) {
			if (local.feeds?.length) useRingResult(local);
			else await lookupUrl(local.source_url);
			return;
		}

		const url = asUrl(input);
		if (!url) {
			error = 'Type a creator name, website, or profile link first.';
			return;
		}
		await lookupUrl(url);
	}

	async function chooseRing(entry: RingEntry) {
		if (ring.isFollowing(entry)) return;
		if (entry.feeds?.length) {
			useRingResult(entry);
			return;
		}
		input = entry.source_url;
		await lookupUrl(entry.source_url);
	}

	function toggle(feed: DiscoveredFeed, on: boolean) {
		const next = new Set(chosen);
		if (on) next.add(feed.url);
		else next.delete(feed.url);
		chosen = next;
	}

	let followedPersonId = $state<string | null>(null);
	let fetchingPosts = $derived(followedPersonId !== null && feeds.fetching.has(followedPersonId));

	async function confirm() {
		if (!result || !chosenFeeds.length || busy) return;
		busy = true;
		try {
			const outcome = selectedRing
				? await followRingSelection(selectedRing, chosenFeeds)
				: await followDiscovered(result, chosenFeeds);
			await ring.refreshFollowing();
			followedPersonId = outcome.person.id;
			void feeds.fetchNewFollow(
				outcome.person.id,
				outcome.feeds.map((feed) => feed.id)
			);
			phase = 'followed';
		} catch {
			error = 'Could not save that follow. There may be no room left on this phone.';
		} finally {
			busy = false;
		}
	}

	function again() {
		followedPersonId = null;
		forumFound = null;
		forumMembersOnly = null;
		forumFollowed = null;
		siteFound = null;
		phase = 'idle';
		result = null;
		selectedRing = null;
		resultOrigin = 'web';
		input = '';
		error = null;
	}

	function labelFor(feed: DiscoveredFeed): string {
		return kindLabel(feed.kind) ?? feed.kind;
	}

	function shortUrl(url: string): string {
		return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
	}
</script>

<svelte:head><title>Build your den</title></svelte:head>

<div class="scroll">
	<header class="head" in:fly={flyIn()}>
		<p class="eyebrow">Follow</p>
		<h2 class="screen-title">Build your <em>den</em>.</h2>
		<p class="lede">
			Add the people and places you like from around the web: a creator, a website, a forum, a
			member of the IndieNodes ring. Type a name or paste a link, and what they share shows up in
			Yips. YipDen checks the IndieNodes ring first, then reads the web only when it needs to.
		</p>
	</header>

	<form class="find" onsubmit={find} novalidate in:fly={flyIn({ delay: 40 })}>
		<label for="followUrl">Creator, website, or profile</label>
		<div class="field">
			<input
				id="followUrl"
				name="followUrl"
				type="text"
				inputmode="search"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="Lena or lenaofori.com"
				bind:value={input}
				role="combobox"
				aria-autocomplete="list"
				aria-controls="ringMatches"
				aria-expanded={phase === 'idle' && ringMatches.length > 0}
				aria-describedby={error ? 'findErr' : undefined}
				aria-invalid={error ? 'true' : undefined}
			/>
			<button class="btn-brand" type="submit" disabled={phase === 'looking'}>
				{phase === 'looking' ? 'Looking…' : 'Find feeds'}
			</button>
		</div>
		{#if phase === 'idle' && ringMatches.length > 0}
			<div class="ring-matches" id="ringMatches" aria-label="People already in IndieNodes">
				<p class="match-label">Already in IndieNodes</p>
				{#each ringMatches as entry (entry.id)}
					<button
						class="ring-match"
						type="button"
						disabled={ring.isFollowing(entry)}
						onclick={() => chooseRing(entry)}
					>
						<span
							class="match-av"
							style:background-image={heroImage(entry) ? `url(${heroImage(entry)})` : ''}
						></span>
						<span class="match-copy">
							<b>{entry.creator}</b>
							<small>{hostOf(entry.source_url)}</small>
						</span>
						<span class="match-action">
							{ring.isFollowing(entry)
								? 'Already following'
								: entry.feeds?.length
									? `${entry.feeds.length} known ${entry.feeds.length === 1 ? 'source' : 'sources'}`
									: 'Check website'}
						</span>
					</button>
				{/each}
			</div>
		{/if}
		{#if error}
			<p class="err" id="findErr">{error}</p>
		{/if}
	</form>

	<div class="results">
		{#if phase === 'looking'}
			<!-- Three placeholders, because that is roughly what a person has. -->
			{#each [0, 1, 2] as row (row)}
				<div class="skel" in:fly={flyIn({ delay: staggerDelay(row) })}></div>
			{/each}
		{:else if phase === 'results' && result}
			{#if result.feeds.length === 0}
				<div class="person" in:fly={flyIn()}>
					<span class="av"></span>
					<span class="person-copy">
						<b>{personName}</b>
						<small>No feeds found on that page.</small>
					</span>
				</div>
				<p class="fine">
					Some sites do not publish a feed. If you know their feed address, paste that instead.
				</p>
			{:else}
				<div class="person" in:fly={flyIn()}>
					<span class="av" style:background-image={result.iconUrl ? `url(${result.iconUrl})` : ''}
					></span>
					<span class="person-copy">
						<b>{personName}</b>
						<small>
							Found {result.feeds.length}
							{result.feeds.length === 1 ? 'place' : 'places'} they publish
						</small>
					</span>
				</div>

				<fieldset class="found" in:fly={flyIn({ delay: 40 })}>
					<legend class="eyebrow">
						{resultOrigin === 'ring'
							? 'Found in the IndieNodes ring'
							: `Found from ${hostOf(result.canonicalUrl)}`}
					</legend>
					{#each result.feeds as feed, index (feed.url)}
						<label class="frow" for="feed-{index}">
							<span class="ft">
								<b>{labelFor(feed)}</b>
								<code>{shortUrl(feed.url)}</code>
								{#if feed.verified}
									<span class="ver">
										<svg viewBox="0 0 24 24" aria-hidden="true"
											><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
										>
										Links back to their site
									</span>
								{/if}
							</span>
							<Switch
								id="feed-{index}"
								label="Follow {labelFor(feed)}"
								checked={chosen.has(feed.url)}
								onchange={(on) => toggle(feed, on)}
							/>
						</label>
					{/each}
					{#each result.unresolved as item (item.url)}
						<div class="nofeed">{hostOf(item.url)}: {item.reason}.</div>
					{/each}
				</fieldset>

				<button
					class="btn-brand wide"
					type="button"
					onclick={confirm}
					disabled={!chosenFeeds.length || busy}
				>
					{chosenFeeds.length === 0
						? 'Pick at least one place'
						: `Follow ${personName} in ${chosenFeeds.length} ${chosenFeeds.length === 1 ? 'place' : 'places'}`}
				</button>
				<button
					class="btn-quiet wide"
					type="button"
					onclick={followPostsOnly}
					disabled={!chosenFeeds.length || busy}
				>
					Just follow its posts as a site
				</button>
			{/if}

			<p class="fine">
				This follow stays on your phone. Nothing is posted anywhere, and {personName} is not notified.
			</p>
		{:else if phase === 'site-followed' && siteFound}
			<div class="person done" in:fly={flyIn()}>
				<span
					class="av"
					style:background-image={siteFound.iconUrl ? `url(${siteFound.iconUrl})` : ''}
				></span>
				<span class="person-copy">
					<b>Following {siteFound.title}</b>
					<small>Saved on this phone</small>
				</span>
			</div>
			<div class="row-btns" in:fly={flyIn({ delay: 40 })}>
				<button class="btn-quiet" type="button" onclick={() => goto('/feeds?pane=sites')}>
					See its posts
				</button>
				<button class="btn-quiet" type="button" onclick={again}>Find something else</button>
			</div>
		{:else if phase === 'forum' && forumMembersOnly}
			<div class="person" in:fly={flyIn()}>
				<span
					class="av"
					style:background-image={forumMembersOnly.logoUrl
						? `url(${forumMembersOnly.logoUrl})`
						: ''}
				></span>
				<span class="person-copy">
					<b>{forumMembersOnly.title}</b>
					<small>This forum is members-only.</small>
				</span>
			</div>
			<p class="fine">
				YipDen reads only what anyone can read without an account, so it cannot follow this one. It
				never asks for a forum’s password.
			</p>
			<button class="btn-quiet" type="button" onclick={again}>Find something else</button>
		{:else if phase === 'forum' && forumFound}
			<ForumPicker
				forum={forumFound.forum}
				categories={forumFound.categories}
				initial={forumFound.categoryId
					? { whole: false, ids: [forumFound.categoryId] }
					: { whole: true, ids: [] }}
				confirmLabel={(count, whole) =>
					whole
						? `Follow ${forumFound!.forum.title}`
						: `Follow ${count} ${count === 1 ? 'category' : 'categories'}`}
				{busy}
				onconfirm={followForum}
			/>
		{:else if phase === 'forum-followed' && forumFollowed}
			<div class="person done" in:fly={flyIn()}>
				<span class="av"></span>
				<span class="person-copy">
					<b>Following {forumFollowed.title}</b>
					<small>
						{forumFollowed.whole
							? 'The whole forum'
							: `${forumFollowed.count} ${forumFollowed.count === 1 ? 'category' : 'categories'}`},
						saved on this phone
					</small>
				</span>
			</div>
			<div class="row-btns" in:fly={flyIn({ delay: 40 })}>
				<button class="btn-quiet" type="button" onclick={() => goto('/feeds?pane=forums')}>
					See its topics in Yips
				</button>
				<button class="btn-quiet" type="button" onclick={again}>Find something else</button>
			</div>
		{:else if phase === 'followed' && result}
			<div class="person done" in:fly={flyIn()}>
				<span class="av" style:background-image={result.iconUrl ? `url(${result.iconUrl})` : ''}
				></span>
				<span class="person-copy">
					<b>Following {personName}</b>
					<small>
						{chosenFeeds.length}
						{chosenFeeds.length === 1 ? 'place' : 'places'}, saved on this phone
					</small>
					{#if fetchingPosts}
						<small class="fetching"><Spinner size={12} /> Fetching their posts…</small>
					{/if}
				</span>
			</div>
			<div class="row-btns" in:fly={flyIn({ delay: 40 })}>
				<button class="btn-quiet" type="button" onclick={() => goto('/feeds')}>
					See their yips
				</button>
				<button class="btn-quiet" type="button" onclick={again}>Find someone else</button>
			</div>
			<p class="fine">
				This follow stays on your phone. Nothing is posted anywhere, and {personName} is not notified.
			</p>
		{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: calc(26px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.eyebrow {
		margin: 0;
		color: var(--brand-text);
	}

	.find {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 6px 20px 0;
	}

	.find label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.field {
		display: flex;
		gap: 8px;
	}

	.ring-matches {
		display: flex;
		flex-direction: column;
		margin-top: 2px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.match-label {
		margin: 0;
		padding: 9px 12px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.ring-match {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 58px;
		padding: 8px 12px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.ring-match:last-child {
		border-bottom: 0;
	}

	.ring-match:disabled {
		opacity: 0.6;
	}

	.match-av {
		flex: 0 0 auto;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-position: center;
		background-size: cover;
	}

	.match-copy {
		flex: 1;
		min-width: 0;
	}

	.match-copy b,
	.match-copy small {
		display: block;
	}

	.match-copy b {
		overflow: hidden;
		font-size: 14px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.match-copy small {
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.match-action {
		flex: 0 0 auto;
		max-width: 110px;
		color: var(--brand-text);
		font-size: 11px;
		font-weight: 650;
		text-align: right;
	}

	.field input {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0 16px;
		border: 1.5px solid var(--line);
		border-radius: var(--r-input);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		/* 16px, so iOS and some Android keyboards do not zoom the page on focus. */
		font-size: 16px;
		transition: border-color var(--dur-s) var(--ease);
	}

	.field input:focus {
		outline: none;
		border-color: var(--brand);
	}

	.btn-brand {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 52px;
		padding: 0 20px;
		border: 0;
		border-radius: var(--r-input);
		background: var(--brand);
		color: #fff;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
		transition:
			background var(--dur-s) var(--ease),
			opacity var(--dur-s) var(--ease);
	}

	.btn-brand:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.btn-brand.wide {
		width: 100%;
	}

	.err {
		margin: 0;
		font-size: 13px;
		color: var(--error);
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 20px 0;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.av {
		flex: 0 0 auto;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
	}

	.person-copy {
		flex: 1;
		min-width: 0;
	}

	/* A long name wraps inside the card rather than running out of it. */
	.person b {
		display: block;
		font-family: var(--display);
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}

	.person small {
		display: block;
		margin-top: 2px;
		font-size: 13px;
		color: var(--muted);
	}

	.fetching {
		display: block;
		color: var(--brand-text);
	}

	.person.done b {
		color: var(--ok);
	}

	.found {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.found legend {
		min-width: 0;
		overflow-wrap: anywhere;
		float: left;
		width: 100%;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
	}

	.frow {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		display: flex;
		clear: both;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--line);
		cursor: pointer;
	}

	.frow:last-of-type {
		border-bottom: 0;
	}

	.ft {
		overflow: hidden;
		flex: 1;
		min-width: 0;
	}

	.frow b {
		display: block;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.frow code {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ver {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ok);
	}

	.ver svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.nofeed {
		min-width: 0;
		overflow-wrap: anywhere;
		clear: both;
		padding: 12px 16px;
		font-size: 13px;
		color: var(--muted);
	}

	.fine {
		margin: 0;
		padding: 0 6px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--muted);
	}

	.row-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.btn-quiet {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 48px;
		padding: 0 18px;
		border: 1px solid var(--line);
		border-radius: var(--r-input);
		background: var(--surface);
		font-family: var(--body);
		font-size: 14.5px;
		font-weight: 600;
	}

	.skel {
		height: 64px;
		border-radius: 18px;
		background: linear-gradient(90deg, var(--line) 0%, var(--surface) 40%, var(--line) 80%);
		background-size: 300% 100%;
		animation: shimmer 1.2s linear infinite;
	}

	@keyframes shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: 0 0;
		}
	}

	/* A shimmer is decoration; under reduced motion it is a flat placeholder instead. */
	@media (prefers-reduced-motion: reduce) {
		.skel {
			animation: none;
		}
	}
</style>
