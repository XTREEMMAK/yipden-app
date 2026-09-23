<script lang="ts">
	import type { RingEntry, RingTrack } from '@yipden/ring-client';
	import { player } from '$lib/player.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';
	import type { QueueItem } from '$lib/player.svelte.js';

	/**
	 * One row in Listen's "From the ring" section: a track any member published in their
	 * `tracks[]`, playable without following anyone. `queue` and `index` place it in the same
	 * playback queue the parent already built from every followed yip and every ring track, so
	 * "Up next" from here carries on into the rest of Listen rather than looping this one row.
	 */

	interface Props {
		entry: RingEntry;
		track: RingTrack;
		queue: QueueItem[];
		index: number;
	}

	let { entry, track, queue, index }: Props = $props();
</script>

<button
	class="trk"
	onclick={(event) => player.play(queue, index, event.currentTarget as HTMLElement)}
	aria-label={`Play ${track.label} by ${entry.creator}`}
>
	<span
		class="art"
		style:background-image={entry.thumb_url ? `url(${entry.thumb_url})` : washFor(entry.id)}
		aria-hidden="true"
	></span>
	<span class="tt">
		<span class="ttl">{track.label}</span>
		<small>{entry.creator}</small>
	</span>
	<span class="pp" aria-hidden="true">
		<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
	</span>
</button>

<style>
	.trk {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		min-height: 72px;
		padding: 10px 14px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: inherit;
		text-align: left;
	}

	.trk:last-child {
		border-bottom: 0;
	}

	.art {
		flex: 0 0 auto;
		width: 52px;
		height: 52px;
		border-radius: 14px;
		background-size: cover;
		background-position: center;
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

	.pp {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.pp svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}
</style>
