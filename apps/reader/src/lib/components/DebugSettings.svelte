<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import Switch from './Switch.svelte';
	import { diagnostics, type DiagKey } from '$lib/diagnostics.svelte.js';
	import { mediaLog } from '$lib/mediaLog.svelte.js';

	let copied = $state(false);
	async function copyLog() {
		try {
			await navigator.clipboard.writeText(mediaLog?.lines.join('\n') ?? '');
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// No clipboard: a screenshot of the list does the same job.
		}
	}

	// THROWAWAY: the Listen embeds spike, removed once its results are reported.
	let spike = $state(false);

	const DIAG: Array<{ key: DiagKey; title: string; note: string }> = [
		{
			key: 'meter',
			title: 'Frame meter',
			note: 'Slow frames after each scroll: partner rings, Feeds and You'
		},
		{ key: 'noStack', title: 'Partner cards flat', note: 'No 3D stack; reopen the ring to apply' },
		{
			key: 'cssStack',
			title: 'Fold cards with scroll-driven CSS',
			note: 'The fold that juddered after a relaunch; restart the app to apply'
		},
		{ key: 'noBackdrop', title: 'No partner backdrop', note: 'Hides the blurred member mosaic' },
		{ key: 'noThumbs', title: 'No partner thumbnails', note: 'Hides member pictures on cards' },
		{
			key: 'noCardGlass',
			title: 'No glass on video posts',
			note: 'Feeds: plain cards where a video waits behind a post; reopen Feeds'
		},
		{
			key: 'eagerCards',
			title: 'Draw every card up front',
			note: 'Feeds: no drawing as cards near the screen; reopen Feeds'
		},
		{
			key: 'noPredecode',
			title: 'No decoding ahead of the screen',
			note: 'Feeds: pictures decode as a card arrives; reopen Feeds'
		},
		{
			key: 'noLibraryThumbs',
			title: 'No Library pictures',
			note: 'Library: icons in place of kept pictures'
		}
	];

	/**
	 * Settings' debug-build section: the age limit switch and the scroll diagnostics.
	 *
	 * Its own component, loaded with a dynamic import behind `__YIPDEN_DEBUG__`, so a release
	 * build (where that constant is the literal `false`) drops the import and never emits this
	 * code at all, rather than shipping it hidden. See vite.config.ts.
	 */
</script>

<section class="grp" in:fly={flyIn({ delay: staggerDelay(2) })}>
	<h3 class="grp-h">Debug build</h3>
	<div class="rows">
		<div class="srow">
			<span class="tt">
				<b>Enforce the age limit</b>
				<small>Off keeps every post, so old saved feeds can be used for testing</small>
			</span>
			<Switch
				id="age-limit-enforced"
				label="Enforce the age limit"
				checked={prefs.ageLimitEnabled}
				onchange={(on) => prefs.setAgeLimitEnabled(on)}
			/>
		</div>
		{#each DIAG as entry (entry.key)}
			<div class="srow">
				<span class="tt">
					<b>{entry.title}</b>
					<small>{entry.note}</small>
				</span>
				<Switch
					id={`diag-${entry.key}`}
					label={entry.title}
					checked={diagnostics?.[entry.key] ?? false}
					onchange={(on) => diagnostics?.set(entry.key, on)}
				/>
			</div>
		{/each}
	</div>
	<button class="srow" onclick={() => (spike = true)}>
		<span class="tt"
			><b>Embed spike</b><small>YouTube, SoundCloud, Spotify, Bandcamp test page</small></span
		>
	</button>
	{#if spike}
		{#await import('./EmbedSpike.svelte') then { default: EmbedSpike }}
			<EmbedSpike onclose={() => (spike = false)} />
		{/await}
	{/if}
	<!-- What the car and lock screen asked of the player, newest first (see mediaLog.svelte.ts). -->
	<div class="media-log">
		<div class="log-head">
			<b>Media log</b>
			<button class="log-btn" onclick={copyLog}>{copied ? 'Copied' : 'Copy'}</button>
			<button class="log-btn" onclick={() => mediaLog?.clear()}>Clear</button>
		</div>
		{#if mediaLog?.lines.length}
			<ol>
				{#each [...mediaLog.lines].reverse() as line, index (index)}
					<li>{line}</li>
				{/each}
			</ol>
		{:else}
			<small>Nothing yet. Use the car's or lock screen's controls, then look here.</small>
		{/if}
	</div>
	<p class="note">Only in debug builds. A release build has none of these.</p>
</section>

<style>
	.media-log {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
	}

	.log-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.log-head b {
		margin-right: auto;
	}

	.log-btn {
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
	}

	.media-log ol {
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 280px;
		overflow-y: auto;
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.5;
	}

	.media-log small {
		color: var(--muted);
	}

	.grp {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.grp-h {
		margin: 0 4px;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.srow {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 64px;
		box-sizing: border-box;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--ink);
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
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

	.note {
		margin: 8px 4px 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.4;
	}
</style>
