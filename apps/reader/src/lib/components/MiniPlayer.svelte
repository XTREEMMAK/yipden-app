<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { swipe } from '$lib/actions/swipe.js';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import { player } from '$lib/player.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';

	/**
	 * Docked above the tab bar whenever something is loaded and the full player is not open.
	 * Swiping it up expands to the full player; the open button is the same action for anyone
	 * not swiping.
	 */

	let dragY = $state(0);
	let dragging = $state(false);

	let progress = $derived(player.duration > 0 ? player.currentTime / player.duration : 0);
</script>

{#if player.current && player.sheet === 'mini'}
	{@const item = player.current}
	<div
		class="mini"
		class:is-playing={player.playing}
		in:fly={flyIn({ y: 28 })}
		out:fade={{ duration: prefersReducedMotion() ? 0 : duration.m }}
		style:transform={dragY ? `translateY(${dragY}px)` : ''}
		style:transition={dragging ? 'none' : 'transform var(--dur-m) var(--ease)'}
		use:swipe={{
			axis: 'y',
			allow: [-1],
			onStart: () => (dragging = true),
			onMove: (delta) => (dragY = prefersReducedMotion() ? 0 : Math.min(0, delta)),
			onEnd: ({ commit }) => {
				dragging = false;
				dragY = 0;
				if (commit) player.expand();
			}
		}}
	>
		<div class="mini-prog" aria-hidden="true">
			<i style:width={`${progress * 100}%`}></i>
		</div>
		<button class="mini-open" onclick={() => player.expand()} aria-label="Open the player">
			<span
				class="mthumb"
				style:background-image={item.artUrl ? `url(${item.artUrl})` : washFor(item.id)}
			></span>
			<span class="mini-t">
				<b>{item.title}</b>
				<small>{item.creator}</small>
			</span>
		</button>
		<button
			class="mini-pp"
			onclick={() => player.toggle()}
			aria-label={player.playing ? 'Pause' : 'Play'}
		>
			{#if player.playing}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
			{/if}
		</button>
		<button class="mini-close" onclick={() => player.stop()} aria-label="Stop and close the player">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M6 6l12 12M18 6L6 18" />
			</svg>
		</button>
	</div>
{/if}

<style>
	.mini {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: calc(92px + env(safe-area-inset-bottom, 0px));
		z-index: 19;
		display: flex;
		align-items: center;
		gap: 6px;
		height: var(--mini-h);
		padding: 0 10px 0 8px;
		border-radius: var(--r-mini);
		background: var(--surface);
		box-shadow:
			0 10px 28px -10px rgba(60, 20, 6, 0.35),
			0 0 0 1px var(--line);
		touch-action: none;
	}

	.mini-prog {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
		pointer-events: none;
	}

	.mini-prog::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 4px;
		background: color-mix(in srgb, var(--brand) 16%, transparent);
	}

	.mini-prog i {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 4px;
		width: 0;
		background: linear-gradient(
			90deg,
			var(--brand) 0%,
			var(--brand) 35%,
			color-mix(in srgb, var(--brand) 36%, white) 50%,
			var(--brand) 65%,
			var(--brand) 100%
		);
		background-size: 220% 100%;
		box-shadow: 0 0 8px color-mix(in srgb, var(--brand) 60%, transparent);
		transition: width var(--dur-s) linear;
	}

	.mini-open {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 100%;
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		color: inherit;
	}

	.mthumb {
		flex: 0 0 auto;
		width: 46px;
		height: 46px;
		border-radius: 12px;
		background-size: cover;
		background-position: center;
	}

	.mini-t {
		flex: 1;
		min-width: 0;
	}

	.mini-t b {
		display: block;
		overflow: hidden;
		font-size: 14px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-t small {
		display: block;
		color: var(--muted);
		font-size: 12px;
	}

	.mini-pp {
		position: relative;
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		padding: 0;
	}

	.mini-pp svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	.mini-close {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		padding: 0;
	}

	.mini-close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* The slow pulse while playing: two staggered rings, only when motion is not reduced. */
	.mini-pp::before,
	.mini-pp::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 50%;
		background: var(--brand);
		opacity: 0;
	}

	@media not (prefers-reduced-motion: reduce) {
		.mini.is-playing .mini-prog i {
			animation: progress-shine calc(var(--dur-l) * 4.5) linear infinite;
		}

		.mini.is-playing .mini-pp::before,
		.mini.is-playing .mini-pp::after {
			animation: pulse calc(var(--dur-l) * 4.5) var(--ease) infinite;
		}

		.mini.is-playing .mini-pp::after {
			animation-delay: calc(var(--dur-l) * 2.25);
		}
	}

	@keyframes progress-shine {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: -120% 0;
		}
	}

	@keyframes pulse {
		0% {
			transform: scale(1);
			opacity: 0.42;
		}
		100% {
			transform: scale(2.1);
			opacity: 0;
		}
	}
</style>
