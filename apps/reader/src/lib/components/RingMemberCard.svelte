<script lang="ts">
	import type { RingEntry } from '@yipden/ring-client';
	import { player } from '$lib/player.svelte.js';
	import { ringPlayer } from '$lib/ringPlayer.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';

	/**
	 * One member in "From the ring": their cover and a play button stand in for a flat list of
	 * their tracks, since a reader browsing Listen is choosing a person to hear from, not
	 * picking one specific track title out of a list. Playing one member starts a continuous
	 * session (see `ringPlayer.svelte.ts`) rather than just that member's own tracks alone.
	 */

	interface Props {
		entry: RingEntry;
	}

	let { entry }: Props = $props();

	let trackCount = $derived(entry.tracks?.length ?? 0);
	let isCurrent = $derived(player.current?.batchKey === entry.id);
	let isQueued = $derived(player.queue.some((item) => item.batchKey === entry.id) && !isCurrent);

	function onPlay(event: MouseEvent): void {
		if (isCurrent) {
			player.toggle();
			return;
		}
		ringPlayer.play(entry, event.currentTarget as HTMLElement);
	}
</script>

<div class="member">
	<button
		class="art"
		class:is-current={isCurrent}
		onclick={onPlay}
		style:background-image={entry.thumb_url ? `url(${entry.thumb_url})` : washFor(entry.id)}
		aria-label={isCurrent
			? `${player.playing ? 'Pause' : 'Play'} ${entry.creator}`
			: `Play ${entry.creator}`}
	>
		<span class="pp" aria-hidden="true">
			{#if isCurrent && player.playing}
				<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
			{:else}
				<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
			{/if}
		</span>
	</button>
	<span class="tt">
		<span class="ttl">{entry.creator}</span>
		<small>{trackCount} {trackCount === 1 ? 'track' : 'tracks'}</small>
	</span>
	<button
		class="queue-btn"
		class:is-queued={isQueued}
		disabled={isQueued}
		onclick={() => ringPlayer.add(entry)}
		aria-label={isQueued
			? `${entry.creator} is already queued`
			: `Add ${entry.creator} to the queue`}
	>
		{#if isQueued}
			<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
		{:else}
			<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
		{/if}
	</button>
</div>

<style>
	.member {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		min-height: 72px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
	}

	.member:last-child {
		border-bottom: 0;
	}

	.art {
		position: relative;
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 0;
		border-radius: 14px;
		background-size: cover;
		background-position: center;
		color: #fff;
	}

	.art::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: rgba(0, 0, 0, 0.18);
		transition: background var(--dur-s) var(--ease);
	}

	.art.is-current::after {
		background: rgba(0, 0, 0, 0.32);
	}

	.pp {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
	}

	.pp svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	.tt {
		flex: 1;
		min-width: 0;
	}

	.ttl {
		display: block;
		font-size: 15px;
		font-weight: 600;
	}

	.tt small {
		display: block;
		margin-top: 2px;
		color: var(--muted);
		font-size: 12.5px;
	}

	.queue-btn {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		/* 44px, the brief's touch target minimum, not a smaller icon-button size. */
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.queue-btn.is-queued {
		background: var(--surface);
		color: var(--muted);
	}

	.queue-btn:disabled {
		cursor: default;
	}

	.queue-btn svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
