<script lang="ts">
	import { App } from '@capacitor/app';
	import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { swipe } from '$lib/actions/swipe.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import { formatTime, player } from '$lib/player.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { ring, washFor } from '$lib/ring.svelte.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import Waveform from './Waveform.svelte';

	/**
	 * The full screen player, over every tab. It stays mounted for the rest of the session once
	 * a reader has played anything at all, shown or hidden with a transform rather than being
	 * created and destroyed, so the waveform beneath it never has to redecode a track just
	 * because the sheet was collapsed and reopened.
	 *
	 * The end of queue prompt and the queue panel are both owned here rather than by whatever
	 * started the queue, the same reasoning `player.svelte.ts` itself follows: there is one
	 * player, not a ring player and a separate everything else player, so there is one place
	 * that shows what is queued and one place that asks what comes after it. `player.ended` only
	 * ever becomes true for a continuous-play ring session today (the only caller that opts out
	 * of the default looping queue), which is why the prompt reads for one without checking that
	 * directly.
	 */

	let dragY = $state(0);
	let dragging = $state(false);
	let queueSheetOpen = $state(false);
	let playerHistoryOpen = false;

	let remaining = $derived(Math.max(0, player.duration - player.currentTime));

	/** A real history entry lets Android Back close this non-route overlay instead of the app. */
	$effect(() => {
		const full = player.sheet === 'full';
		if (full && !playerHistoryOpen) {
			window.history.pushState(
				{ ...window.history.state, yipdenPlayer: true },
				'',
				window.location.href
			);
			playerHistoryOpen = true;
		} else if (!full && playerHistoryOpen) {
			playerHistoryOpen = false;
			window.history.back();
		}
	});

	/**
	 * Keep the native listener for queue-layer priority and explicit app exit, while popstate is
	 * the shared browser/native path that turns a Back navigation into a player collapse.
	 */
	onMount(() => {
		let removed = false;
		let listener: PluginListenerHandle | undefined;

		const handlePopState = (event: PopStateEvent) => {
			if (event.state?.yipdenPlayer) {
				playerHistoryOpen = true;
				player.expand();
				return;
			}
			if (!playerHistoryOpen) return;
			playerHistoryOpen = false;
			if (player.sheet === 'full') player.collapse();
		};
		window.addEventListener('popstate', handlePopState);

		if (Capacitor.isNativePlatform()) {
			void App.addListener('backButton', ({ canGoBack }) => {
				if (queueSheetOpen) {
					queueSheetOpen = false;
					return;
				}
				if (player.sheet === 'full') {
					if (playerHistoryOpen) window.history.back();
					else player.collapse();
					return;
				}
				if (canGoBack) window.history.back();
				else void App.exitApp();
			}).then((handle) => {
				if (removed) void handle.remove();
				else listener = handle;
			});
		}

		return () => {
			removed = true;
			window.removeEventListener('popstate', handlePopState);
			void listener?.remove();
		};
	});
</script>

{#if player.current}
	{@const item = player.current}
	<section
		class="player"
		class:open={player.sheet === 'full'}
		aria-label="Now playing"
		aria-hidden={player.sheet !== 'full'}
		inert={player.sheet !== 'full'}
		style:transform={dragY ? `translateY(${dragY}px)` : ''}
		style:transition={dragging ? 'none' : 'transform var(--dur-l) var(--ease)'}
		use:swipe={{
			axis: 'y',
			allow: [1],
			exclude: '[data-noswipe]',
			enabled: () => player.sheet === 'full',
			onStart: () => (dragging = true),
			onMove: (delta) => (dragY = prefersReducedMotion() ? 0 : Math.max(0, delta)),
			onEnd: ({ commit }) => {
				dragging = false;
				dragY = 0;
				if (commit) player.collapse();
			}
		}}
	>
		<div
			class="pl-art"
			style:background-image={item.artUrl ? `url(${item.artUrl})` : washFor(item.id)}
			aria-hidden="true"
		></div>
		<div class="pl-shade" aria-hidden="true"></div>

		<header class="pl-top">
			<button class="round" onclick={() => player.collapse()} aria-label="Collapse the player">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
			</button>
			<span class="pl-label">Now playing</span>
			<span class="pl-top-right">
				<button
					class="round"
					data-noswipe
					disabled={player.queue.length < 2}
					onclick={() => (queueSheetOpen = true)}
					aria-haspopup="dialog"
					aria-expanded={queueSheetOpen}
					aria-label="Open the queue"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 6h16M4 12h10M4 18h7" />
					</svg>
				</button>
				<button
					class="round"
					onclick={() => openExternal(item.siteUrl)}
					aria-label="Open on the creator's site"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
				</button>
			</span>
		</header>

		<div class="pl-body">
			<span class="src">{item.creator}</span>
			<h2 class="pl-title">{item.title}</h2>
			<p class="pl-host">{new URL(item.siteUrl).hostname.replace(/^www\./, '')}</p>

			<Waveform />

			<div class="times">
				<span>{formatTime(player.currentTime)}</span>
				<span>-{formatTime(remaining)}</span>
			</div>

			{#if player.ended}
				{@const suggestion = ringPlayer.suggest(ring.all)}
				<div class="end-prompt" data-noswipe transition:fly={flyIn({ y: 12 })}>
					{#if suggestion}
						<p>Queue finished. Play more from <b>{suggestion.creator}</b> next?</p>
						<div class="end-actions">
							<button class="end-quiet" onclick={() => player.stop()}>Stop</button>
							<button class="end-main" onclick={() => ringPlayer.add(suggestion)}>Keep going</button
							>
						</div>
					{:else}
						<p>Nothing else in the ring to play.</p>
						<div class="end-actions">
							<button class="end-main" onclick={() => player.stop()}>Stop</button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="tiles">
				<button class="tile" onclick={() => player.advance()} disabled={!player.next}>
					<span class="tile-k">Up next</span>
					<span class="tile-v">{player.next?.title ?? '–'}</span>
				</button>
				<button class="tile" onclick={() => player.cycleRate()}>
					<span class="tile-k">Speed</span>
					<span class="tile-v">{player.rate}{'×'}</span>
				</button>
			</div>

			<div class="pl-ctrls">
				<button class="round lg" onclick={() => player.skip(-15)} aria-label="Back 15 seconds">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
						<path d="M4.5 4v3.5H8" />
					</svg>
					<span class="skip-n">15</span>
				</button>
				<button
					class="bigplay"
					onclick={() => player.toggle()}
					aria-label={player.playing ? 'Pause' : 'Play'}
				>
					{#if player.playing}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg
						>
					{:else}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
					{/if}
				</button>
				<button class="round lg" onclick={() => player.skip(30)} aria-label="Forward 30 seconds">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
						<path d="M19.5 4v3.5H16" />
					</svg>
					<span class="skip-n">30</span>
				</button>
			</div>
		</div>
	</section>

	{#if queueSheetOpen}
		<button
			type="button"
			class="sheet-backdrop"
			data-noswipe
			tabindex="-1"
			aria-label="Close"
			onclick={() => (queueSheetOpen = false)}
			transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
		></button>
		<div
			class="queue-sheet"
			data-noswipe
			role="dialog"
			aria-modal="true"
			aria-label="Queue"
			in:fly={flyIn({ y: 40 })}
			out:fly={flyIn({ y: 40 })}
		>
			<div class="sheet-head">
				<h2>Queue</h2>
				<button class="sheet-close" onclick={() => (queueSheetOpen = false)} aria-label="Close">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			</div>
			<ul class="queue-list">
				{#each player.queue as queued, index (queued.id + index)}
					<li class="queue-row" class:is-current={index === player.currentIndex}>
						<button
							class="queue-jump"
							onclick={() => player.jumpTo(index)}
							disabled={index === player.currentIndex}
							aria-label={`Play ${queued.title} by ${queued.creator}`}
						>
							<span class="queue-title">{queued.title}</span>
							<small>{queued.creator}</small>
						</button>
						<span class="queue-move">
							<button
								onclick={() => player.move(index, index - 1)}
								disabled={index === 0}
								aria-label={`Move ${queued.title} earlier`}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
							</button>
							<button
								onclick={() => player.move(index, index + 1)}
								disabled={index === player.queue.length - 1}
								aria-label={`Move ${queued.title} later`}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
							</button>
						</span>
						<button
							class="queue-remove"
							onclick={() => player.removeAt(index)}
							aria-label={`Remove ${queued.title} from the queue`}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M6 6l12 12M18 6L6 18" />
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/if}

<svelte:window
	onkeydown={(event) => {
		if (queueSheetOpen && event.key === 'Escape') queueSheetOpen = false;
	}}
/>

<style>
	.player {
		position: absolute;
		inset: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		background: var(--player);
		color: #fff;
		touch-action: none;
		user-select: none;
		transform: translateY(100%);
	}

	.player.open {
		transform: translateY(0);
	}

	.pl-art {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 66%;
		background-size: cover;
		background-position: center;
	}

	.pl-shade {
		position: absolute;
		inset: 0;
		background: var(--scrim-player);
	}

	.pl-top {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: calc(22px + env(safe-area-inset-top, 0px)) 20px 0;
	}

	.pl-top-right {
		display: flex;
		gap: 8px;
	}

	.round:disabled {
		opacity: 0.4;
	}

	.pl-label {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
	}

	.round svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.pl-body {
		position: relative;
		z-index: 1;
		margin-top: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 0 24px calc(30px + env(safe-area-inset-bottom, 0px));
	}

	.src {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.85);
	}

	.pl-title {
		margin: 0;
		font-family: var(--display);
		font-size: 30px;
		line-height: 1.02;
		font-weight: 680;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.pl-host {
		margin: 0;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.85);
	}

	.times {
		align-self: stretch;
		display: flex;
		justify-content: space-between;
		font-family: var(--mono);
		font-size: 12px;
		color: rgba(255, 255, 255, 0.88);
		font-variant-numeric: tabular-nums;
	}

	.tiles {
		align-self: stretch;
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 10px;
		margin-top: 6px;
	}

	.tile {
		min-width: 0;
		height: 62px;
		border: 0;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.14);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
		color: #fff;
		padding: 0 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: 3px;
		text-align: left;
	}

	.tile:disabled {
		opacity: 0.5;
	}

	.tile-k {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.8);
	}

	.tile-v {
		max-width: 100%;
		overflow: hidden;
		font-size: 14px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pl-ctrls {
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 0;
	}

	.round.lg {
		position: relative;
		width: 58px;
		height: 58px;
	}

	.round.lg svg {
		width: 26px;
		height: 26px;
		stroke-width: 1.7;
	}

	.skip-n {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--mono);
		font-size: 9px;
		font-weight: 600;
		line-height: 1;
		pointer-events: none;
	}

	.bigplay {
		width: 82px;
		height: 82px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		color: var(--brand);
		display: grid;
		place-items: center;
		padding: 0;
		box-shadow: 0 14px 30px -12px rgba(30, 8, 2, 0.6);
	}

	.bigplay svg {
		width: 30px;
		height: 30px;
		fill: currentColor;
	}

	.end-prompt {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
		padding: 14px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.14);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
	}

	.end-prompt p {
		margin: 0;
		font-size: 14px;
		line-height: 1.4;
	}

	.end-actions {
		display: flex;
		gap: 8px;
	}

	.end-quiet,
	.end-main {
		flex: 1;
		height: 44px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 14px;
		font-weight: 600;
	}

	.end-quiet {
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
	}

	.end-main {
		background: #fff;
		color: var(--brand);
	}

	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		border: 0;
		padding: 0;
		background: rgba(0, 0, 0, 0.4);
		cursor: default;
	}

	.queue-sheet {
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
		background: var(--player);
		color: #fff;
		box-shadow: 0 -12px 30px -10px rgba(0, 0, 0, 0.4);
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
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
	}

	.sheet-close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.queue-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.queue-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-radius: 14px;
	}

	.queue-row.is-current {
		background: rgba(255, 255, 255, 0.1);
	}

	.queue-jump {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 8px 6px;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
	}

	.queue-jump:disabled {
		cursor: default;
	}

	.queue-title {
		display: block;
		overflow: hidden;
		font-size: 14px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.queue-jump small {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		color: rgba(255, 255, 255, 0.7);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.queue-move {
		display: flex;
	}

	/* 44px, the brief's touch target minimum, even packed this closely together. */
	.queue-move button,
	.queue-remove {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		background: none;
		color: rgba(255, 255, 255, 0.85);
	}

	.queue-move button:disabled {
		opacity: 0.3;
	}

	.queue-move svg,
	.queue-remove svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
