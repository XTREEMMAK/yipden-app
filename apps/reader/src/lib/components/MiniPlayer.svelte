<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { duration, flyIn, gesture, prefersReducedMotion } from '$lib/motion.js';
	import { player } from '$lib/player.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';

	/**
	 * Docked above the tab bar whenever something is loaded and the full player is not open.
	 *
	 * It moves one way: up and down. Dragged well up and let go, it opens the full player (the open
	 * button is the same action for anyone not dragging). Dragged down, a Minimize strip along the
	 * bottom of the screen lights up, and letting go there shrinks the player to a small button in
	 * the corner that a tap brings back. Minimize is what a reader wants while reading Settings or
	 * scrolling a list; it is a drag rather than a third button so the bar stays as short as it is.
	 * Scrolling Feeds or a ring's members minimizes it too (see tuckMini). Closing is the bar's own
	 * button.
	 */

	let dragY = $state(0);
	let dragging = $state(false);
	/** True while the bar is far enough down that letting go minimizes it. */
	let overMinimize = $state(false);

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let prevY = 0;
	let prevTime = 0;
	let lastY = 0;
	let lastTime = 0;

	/** How far up it must be carried to open the player: a deliberate lift, not a brush. */
	const OPEN_AFTER_PX = 96;
	/** A quick flick up opens it from less far, but still not from a twitch. */
	const OPEN_FLICK_PX = 40;
	/** How far down counts as on the Minimize strip. */
	const MINIMIZE_AFTER_PX = 28;

	function onPointerDown(event: PointerEvent): void {
		if (pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		prevY = lastY = event.clientY;
		prevTime = lastTime = event.timeStamp;
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (!dragging) {
			// Below the slop this is still a tap, so the buttons on the bar keep working.
			if (Math.abs(dx) < gesture.slopPx && Math.abs(dy) < gesture.slopPx) return;
			// Sideways is not a direction the bar goes: the gesture is dropped, not followed.
			if (Math.abs(dx) > Math.abs(dy)) {
				pointerId = null;
				return;
			}
			dragging = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}
		prevY = lastY;
		prevTime = lastTime;
		lastY = event.clientY;
		lastTime = event.timeStamp;
		event.preventDefault();
		// The bar follows the finger; under reduced motion it stays put and only the strip lights up.
		if (!prefersReducedMotion()) dragY = dy;
		overMinimize = dy >= MINIMIZE_AFTER_PX;
	}

	function settle(): void {
		pointerId = null;
		dragging = false;
		dragY = 0;
		overMinimize = false;
	}

	function onPointerUp(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		const node = event.currentTarget as HTMLElement;
		if (!dragging) {
			pointerId = null;
			return;
		}
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);

		const dy = event.clientY - startY;
		const velocity =
			(prevY - event.clientY) / Math.max(1, (event.timeStamp || lastTime) - prevTime);
		const flicked = velocity >= gesture.flickVelocity && -dy >= OPEN_FLICK_PX;
		settle();

		if (dy >= MINIMIZE_AFTER_PX) player.miniTucked = true;
		else if (-dy >= OPEN_AFTER_PX || flicked) player.expand();
	}

	function onPointerCancel(event: PointerEvent): void {
		if (event.pointerId === pointerId) settle();
	}

	let progress = $derived(player.duration > 0 ? player.currentTime / player.duration : 0);
</script>

{#if player.current && player.sheet === 'mini' && player.miniTucked}
	{@const item = player.current}
	<!--
		Minimized: dropped on Minimize, or tucked out of a scrolling thumb's way (see tuckMini). No
		drag and no close here, only a tap that brings the mini player back.
	-->
	<button
		class="mini-tucked"
		class:is-playing={player.playing}
		in:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
		onclick={() => (player.miniTucked = false)}
		aria-label={`Show the player: ${item.title}`}
		style:background-image={item.artUrl ? `url(${item.artUrl})` : washFor(item.id)}
	>
		<span class="tucked-glyph" aria-hidden="true">
			{#if player.playing}
				<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
			{:else}
				<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
			{/if}
		</span>
	</button>
{:else if player.current && player.sheet === 'mini'}
	{@const item = player.current}
	<div
		class="mini"
		class:is-playing={player.playing}
		in:fly={flyIn({ y: 28 })}
		out:fade={{ duration: prefersReducedMotion() ? 0 : duration.m }}
		class:dragging
		style:transform={dragY ? `translateY(${dragY}px)` : ''}
		style:transition={dragging ? 'none' : 'transform var(--dur-m) var(--ease)'}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		role="group"
		aria-label="Player"
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

{#if dragging && dragY > 0}
	<!-- Where a mini player dragged down is let go to minimize it. Shown only during that drag. -->
	<div class="drops" aria-hidden="true" transition:fade={{ duration: duration.s }}>
		<div class="drop" class:over={overMinimize}>
			<svg viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6" /></svg>
			Minimize
		</div>
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

	/* Above the Minimize strip while it is carried, so it is seen arriving on it. */
	.mini.dragging {
		z-index: 46;
	}

	.drops {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 45;
		display: flex;
		gap: 10px;
		height: calc(120px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
		background: linear-gradient(to top, rgba(18, 7, 4, 0.92) 55%, rgba(18, 7, 4, 0));
		pointer-events: none;
	}

	.drop {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 2px dashed rgba(255, 255, 255, 0.45);
		border-radius: var(--r-mini);
		color: #fff;
		font-family: var(--body);
		font-size: 14px;
		font-weight: 600;
		transition:
			background-color var(--dur-s) var(--ease),
			border-color var(--dur-s) var(--ease),
			transform var(--dur-s) var(--ease);
	}

	.drop svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.drop.over {
		border-style: solid;
		border-color: var(--brand);
		background: var(--brand);
		transform: scale(1.03);
	}

	.mini-tucked {
		position: absolute;
		/*
		 * In line with Discover's row of action buttons, which leaves this place free while the
		 * player is minimized: the same 22px margin, 18px above the dock, the same 52px height.
		 */
		right: 22px;
		bottom: calc(var(--dock) + 18px);
		z-index: 19;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background-color: var(--surface);
		background-size: cover;
		background-position: center;
		box-shadow:
			0 10px 28px -10px rgba(60, 20, 6, 0.45),
			0 0 0 2px var(--surface);
	}

	.mini-tucked.is-playing {
		box-shadow:
			0 10px 28px -10px rgba(60, 20, 6, 0.45),
			0 0 0 2px var(--brand);
	}

	/* The play button's slow pulse, as rings leaving the button, so a minimized player reads as live. */
	.mini-tucked::before,
	.mini-tucked::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		box-sizing: border-box;
		border: 2px solid var(--brand);
		border-radius: 50%;
		opacity: 0;
		pointer-events: none;
	}

	.tucked-glyph {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgba(18, 6, 2, 0.62);
		color: #fff;
	}

	.tucked-glyph svg {
		width: 14px;
		height: 14px;
		fill: currentColor;
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
		.mini.is-playing .mini-pp::after,
		.mini-tucked.is-playing::before,
		.mini-tucked.is-playing::after {
			animation: pulse calc(var(--dur-l) * 4.5) var(--ease) infinite;
		}

		.mini.is-playing .mini-pp::after,
		.mini-tucked.is-playing::after {
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
