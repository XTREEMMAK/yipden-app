<script lang="ts">
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { discoverFeeds, type DiscoveredFeed, type DiscoveryResult } from '@yipden/feeds';
	import { followDiscovered } from '$lib/follow.js';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { httpFetch } from '$lib/platform/http.js';
	import { ring } from '$lib/ring.svelte.js';
	import Switch from '$components/Switch.svelte';

	/**
	 * Follow: paste a link, see everywhere that person publishes, pick which of it you want.
	 *
	 * The list of found feeds is a list the reader edits, never a list the app acts on by
	 * itself. Following everything found would make the toggles a decoration, and following is
	 * the one thing in this app a reader does about another person.
	 */

	type Phase = 'idle' | 'looking' | 'results' | 'followed';

	let phase = $state<Phase>('idle');
	let input = $state('');
	let error = $state<string | null>(null);
	let result = $state<DiscoveryResult | null>(null);
	let chosen = $state<Set<string>>(new Set());
	let busy = $state(false);

	let personName = $derived(
		result?.title ?? (result ? hostOf(result.canonicalUrl) : 'this person')
	);
	let chosenFeeds = $derived(result?.feeds.filter((feed) => chosen.has(feed.url)) ?? []);

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

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

	async function find(event: SubmitEvent) {
		event.preventDefault();
		const url = asUrl(input);
		if (!url) {
			error = 'Paste a website or profile link first.';
			return;
		}

		error = null;
		phase = 'looking';
		result = null;

		try {
			const found = await discoverFeeds(url, { fetch: httpFetch });
			result = found;
			chosen = new Set(found.feeds.map((feed) => feed.url));
			phase = 'results';
		} catch (cause) {
			phase = 'idle';
			error =
				cause instanceof Error && cause.message.includes('https address')
					? 'That does not look like a website address.'
					: `Could not read ${hostOf(url)}. Check the address, or try again when you are online.`;
		}
	}

	function toggle(feed: DiscoveredFeed, on: boolean) {
		const next = new Set(chosen);
		if (on) next.add(feed.url);
		else next.delete(feed.url);
		chosen = next;
	}

	async function confirm() {
		if (!result || !chosenFeeds.length || busy) return;
		busy = true;
		try {
			await followDiscovered(result, chosenFeeds);
			await ring.refreshFollowing();
			phase = 'followed';
		} catch {
			error = 'Could not save that follow. There may be no room left on this phone.';
		} finally {
			busy = false;
		}
	}

	function again() {
		phase = 'idle';
		result = null;
		input = '';
		error = null;
	}

	function labelFor(feed: DiscoveredFeed): string {
		const labels: Record<string, string> = {
			blog: 'Blog',
			bluesky: 'Bluesky',
			mastodon: 'Mastodon',
			youtube: 'YouTube',
			peertube: 'PeerTube',
			podcast: 'Podcast',
			forum: 'Forum'
		};
		return labels[feed.kind] ?? feed.kind;
	}

	function shortUrl(url: string): string {
		return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
	}
</script>

<svelte:head><title>Follow</title></svelte:head>

<div class="scroll">
	<header class="head" in:fly={flyIn()}>
		<p class="eyebrow">Follow</p>
		<h2 class="screen-title">Follow a <em>person</em>, not a platform.</h2>
		<p class="lede">
			Paste any website or profile. YipDen reads that one page and the profiles it links to, then
			shows you everywhere they publish.
		</p>
	</header>

	<form class="find" onsubmit={find} novalidate in:fly={flyIn({ delay: 40 })}>
		<label for="followUrl">Website or profile</label>
		<div class="field">
			<input
				id="followUrl"
				name="followUrl"
				type="text"
				inputmode="url"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="lenaofori.com"
				bind:value={input}
				aria-describedby={error ? 'findErr' : undefined}
				aria-invalid={error ? 'true' : undefined}
			/>
			<button class="btn-brand" type="submit" disabled={phase === 'looking'}>
				{phase === 'looking' ? 'Looking…' : 'Find feeds'}
			</button>
		</div>
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
					<span>
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
					<span>
						<b>{personName}</b>
						<small>
							Found {result.feeds.length}
							{result.feeds.length === 1 ? 'place' : 'places'} they publish
						</small>
					</span>
				</div>

				<fieldset class="found" in:fly={flyIn({ delay: 40 })}>
					<legend class="eyebrow">Found from {hostOf(result.canonicalUrl)}</legend>
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
			{/if}

			<p class="fine">
				This follow stays on your phone. Nothing is posted anywhere, and {personName} is not notified.
			</p>
		{:else if phase === 'followed' && result}
			<div class="person done" in:fly={flyIn()}>
				<span class="av" style:background-image={result.iconUrl ? `url(${result.iconUrl})` : ''}
				></span>
				<span>
					<b>Following {personName}</b>
					<small>
						{chosenFeeds.length}
						{chosenFeeds.length === 1 ? 'place' : 'places'}, saved on this phone
					</small>
				</span>
			</div>
			<div class="row-btns" in:fly={flyIn({ delay: 40 })}>
				<button class="btn-quiet" type="button" onclick={() => goto('/today')}>
					See their yips in Today
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

	.person b {
		display: block;
		font-family: var(--display);
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.person small {
		display: block;
		margin-top: 2px;
		font-size: 13px;
		color: var(--muted);
	}

	.person.done b {
		color: var(--ok);
	}

	.found {
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.found legend {
		float: left;
		width: 100%;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
	}

	.frow {
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
		flex: 1;
		min-width: 0;
	}

	.frow b {
		display: block;
		font-size: 15px;
		font-weight: 600;
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
