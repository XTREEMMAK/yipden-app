<script lang="ts">
	import { hostOf } from '$lib/hosts.js';
	import { previewKindOf, type PreviewKind } from '@yipden/ring-client';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import type { RingOrigin } from '$lib/references/types.js';
	import PlatformIcon from './PlatformIcon.svelte';

	/**
	 * Tracks a reader added to a creator themselves. Adding one by link is `KeepByLink`'s.
	 *
	 * Always labelled as the reader's own: the creator never chose these. A real audio file plays
	 * in the app's one player; a platform page opens on its own site.
	 */

	interface Props {
		creator: { url: string; name: string; artUrl?: string | null; ring?: RingOrigin | null };
		/** Called as a track starts, so a sheet holding this list can get out of the player's way. */
		onplay?: () => void;
	}

	let { creator, onplay }: Props = $props();

	let tracks = $derived(creatorNotes.tracksFor(creator.url));

	const PLAY_LABELS: Record<PreviewKind, string> = {
		file: 'Play',
		youtube: 'Watch on YouTube',
		soundcloud: 'Open on SoundCloud',
		bandcamp: 'Open on Bandcamp',
		spotify: 'Open on Spotify',
		'apple-music': 'Open on Apple Music',
		external: 'Open'
	};
</script>

<div class="reader-tracks">
	{#if tracks.length}
		<ul class="list">
			{#each tracks as track (track.url)}
				{@const kind = previewKindOf(track.url)}
				<li class="track">
					<button
						class="play"
						disabled={track.gone}
						aria-label={track.gone
							? `${track.title} is no longer on their site`
							: `${PLAY_LABELS[kind]}: ${track.title}`}
						onclick={(event) => {
							onplay?.();
							creatorNotes.play(creator, track.url, event.currentTarget);
						}}
					>
						<PlatformIcon {kind} />
					</button>
					<span class="text">
						<b>{track.title}</b>
						<small
							>{track.gone ? 'No longer on their site' : 'Added by you'} · {hostOf(
								track.url
							)}</small
						>
					</span>
					<button
						class="remove"
						aria-label={`Remove ${track.title}`}
						onclick={() => creatorNotes.removeTrack(creator.url, track.url)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.reader-tracks {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.track {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.play,
	.remove {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.play {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	/* Gone from their site: still listed so it can be removed, but there is nothing to play. */
	.play:disabled {
		border-color: var(--line);
		background: transparent;
		color: var(--muted);
	}

	.remove svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		font-size: 14px;
	}

	.text b,
	.text small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.text small {
		color: var(--muted);
		font-size: 12px;
	}
</style>
