<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { theme, type Theme } from '$lib/theme.svelte.js';
	import Switch from '$components/Switch.svelte';
	import { you } from '$lib/you.svelte.js';
	import { downloadTextFile, pickTextFile } from '$lib/platform/download.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';

	/**
	 * You: appearance, the follow list, and the reader's own data. Everything here is either
	 * read from or written straight to the device; there is no account in v0.9.
	 */

	const THEMES: Array<{ key: Theme; label: string }> = [
		{ key: 'system', label: 'System' },
		{ key: 'light', label: 'Light' },
		{ key: 'dark', label: 'Dark' }
	];

	let segEls: HTMLButtonElement[] = [];
	let segIndicator = $state({ left: 0, width: 0 });
	let confirmingId = $state<string | null>(null);
	let importing = $state(false);

	function measureSeg() {
		const index = THEMES.findIndex((entry) => entry.key === theme.current);
		const el = segEls[index];
		if (el) segIndicator = { left: el.offsetLeft, width: el.offsetWidth };
	}

	$effect(() => {
		void theme.current;
		measureSeg();
	});

	onMount(() => {
		void you.load();
		const onResize = () => measureSeg();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	async function confirmUnfollow(personId: string, name: string) {
		confirmingId = null;
		await you.unfollow(personId);
		toast.show(`Unfollowed ${name}. Their yips are gone from Feeds.`);
	}

	function exportFollows() {
		if (!you.rows.length) return;
		downloadTextFile('yipden-follows.opml', you.toOpml());
		toast.show('Saved yipden-follows.opml.');
	}

	async function importFollows() {
		importing = true;
		try {
			const text = await pickTextFile('.opml,.xml,text/xml,text/x-opml');
			if (!text) return;
			const { people, feeds } = await you.importOpml(text);
			toast.show(
				people === 0
					? 'Nothing new to import from that file.'
					: `Imported ${people} ${people === 1 ? 'person' : 'people'}, ${feeds} ${feeds === 1 ? 'feed' : 'feeds'}.`
			);
		} catch {
			toast.show('Could not read that file as OPML.');
		} finally {
			importing = false;
		}
	}

	async function clearCachedYips() {
		await you.clearCachedYips();
		toast.show('Cleared cached yips. Your follows stay put.');
	}
</script>

<svelte:head><title>You</title></svelte:head>

<div class="scroll">
	<header class="head" in:fly={flyIn()}>
		<p class="eyebrow">You {'·'} on this phone</p>
		<h2 class="screen-title">Your <em>den</em>.</h2>
		<p class="lede">Everything here lives on this phone. Reading never needs an account.</p>
	</header>

	<div class="groups">
		<section class="grp" in:fly={flyIn({ delay: staggerDelay(0) })}>
			<h3 class="grp-h">Appearance</h3>
			<div class="seg" role="radiogroup" aria-label="Theme">
				<span
					class="seg-ind"
					aria-hidden="true"
					style:transform={`translateX(${segIndicator.left}px)`}
					style:width={`${segIndicator.width}px`}
				></span>
				{#each THEMES as entry, index (entry.key)}
					<button
						bind:this={segEls[index]}
						role="radio"
						aria-checked={theme.current === entry.key}
						onclick={() => theme.set(entry.key)}
					>
						{entry.label}
					</button>
				{/each}
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(1) })}>
			<h3 class="grp-h">Playback</h3>
			<div class="rows">
				<div class="srow">
					<span class="tt">
						<b>Shuffle music</b>
						<small>Mix up a member{"'"}s tracks when you add them to the queue</small>
					</span>
					<Switch
						id="shuffle-music"
						label="Shuffle music"
						checked={prefs.shuffleMusic}
						onchange={(on) => prefs.setShuffleMusic(on)}
					/>
				</div>
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(2) })}>
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
					<p class="empty">You are not following anyone yet. Discover is a good place to start.</p>
				{:else}
					{#each you.rows as row (row.person.id)}
						<div class="srow">
							<span
								class="av"
								style:background-image={row.person.iconUrl ? `url(${row.person.iconUrl})` : ''}
							></span>
							<span class="tt">
								<b>{row.person.name}</b>
								<small>
									{row.feeds.length}
									{row.feeds.length === 1 ? 'feed' : 'feeds'}
									{'·'}
									{new URL(row.person.siteUrl).hostname.replace(/^www\./, '')}
								</small>
							</span>
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
									class="mini-btn"
									aria-label={`Unfollow ${row.person.name}`}
									onclick={() => (confirmingId = row.person.id)}
								>
									Unfollow
								</button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(3) })}>
			<h3 class="grp-h">Your follows file</h3>
			<div class="rows">
				<button class="srow link" onclick={exportFollows} disabled={!you.rows.length}>
					<span class="tt">
						<b>Export as OPML</b>
						<small>Take your follows to any other reader</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
				</button>
				<button class="srow link" onclick={importFollows} disabled={importing}>
					<span class="tt">
						<b>{importing ? 'Importing…' : 'Import OPML'}</b>
						<small>Bring follows in from another reader</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				</button>
				<button class="srow link" onclick={clearCachedYips}>
					<span class="tt">
						<b>Clear cached yips</b>
						<small>Your follows stay put</small>
					</span>
				</button>
			</div>
		</section>

		<p class="fine" in:fly={flyIn({ delay: staggerDelay(4) })}>
			YipDen v0.0.1 {'·'} chronological, no AI, and every yip links out to its creator.
		</p>
	</div>

	<Toast />
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
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 4px 16px 0;
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

	.seg {
		position: relative;
		display: flex;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.seg-ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 999px;
		background: var(--brand);
		transition:
			transform var(--dur-m) var(--ease),
			width var(--dur-m) var(--ease);
	}

	.seg button {
		position: relative;
		z-index: 1;
		flex: 1;
		/* 44px, not the prototype's 42px: the brief's touch target floor. See DECISIONS.md. */
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font-family: var(--body);
		font-size: 14px;
		font-weight: 550;
		transition: color var(--dur-s) var(--ease);
	}

	.seg button[aria-checked='true'] {
		color: #fff;
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

	.srow:disabled {
		opacity: 0.5;
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

	.srow.link svg {
		flex: 0 0 auto;
		width: 16px;
		height: 16px;
		color: var(--muted);
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
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

	.mini-btn.danger {
		background: var(--error);
		border-color: var(--error);
		color: #fff;
	}

	.confirm {
		display: flex;
		gap: 6px;
	}

	.fine {
		margin: 0;
		padding: 0 6px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
</style>
