<script lang="ts">
	import { swipe } from '$lib/actions/swipe.js';
	import { prefersReducedMotion } from '$lib/motion.js';
	import { formatTime, player } from '$lib/player.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { washFor } from '$lib/ring.svelte.js';
	import Waveform from './Waveform.svelte';

	/**
	 * The full screen player, over every tab. It stays mounted for the rest of the session once
	 * a reader has played anything at all, shown or hidden with a transform rather than being
	 * created and destroyed, so the waveform beneath it never has to redecode a track just
	 * because the sheet was collapsed and reopened.
	 */

	let dragY = $state(0);
	let dragging = $state(false);

	let remaining = $derived(Math.max(0, player.duration - player.currentTime));
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
			<button
				class="round"
				onclick={() => openExternal(item.siteUrl)}
				aria-label="Open on the creator's site"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
			</button>
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
{/if}

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
		/* Nudged down slightly to sit inside the arrow's curve, matching the reference SVG. */
		padding-top: 6px;
		font-family: var(--mono);
		font-size: 9px;
		font-weight: 600;
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
</style>
