<script lang="ts">
	import { previewKindOf, type PreviewKind } from '@yipden/ring-client';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import type { RingOrigin } from '$lib/references/types.js';
	import { keepMessage } from '$lib/references/messages.js';
	import { toast } from '$lib/toast.svelte.js';
	import PlatformIcon from './PlatformIcon.svelte';

	/**
	 * Tracks a reader added to a creator themselves, and a form to add one by link.
	 *
	 * Always labelled as the reader's own: the creator never chose these. A real audio file plays
	 * in the app's one player; a platform page opens on its own site.
	 */

	interface Props {
		creator: { url: string; name: string; artUrl?: string | null; ring?: RingOrigin | null };
		/** Distinguishes form fields when several of these are on one screen. */
		id: string;
		/** Called as a track starts, so a sheet holding this list can get out of the player's way. */
		onplay?: () => void;
	}

	let { creator, id, onplay }: Props = $props();

	let link = $state('');
	let title = $state('');
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

	let adding = $state(false);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		adding = true;
		try {
			const result = await creatorNotes.addTrack(creator, { url: link, title });
			if (result === 'added') {
				link = '';
				title = '';
			}
			toast.show(keepMessage(result, creator.name));
		} finally {
			adding = false;
		}
	}
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
							>{track.gone ? 'No longer on their site' : 'Added by you'} · {new URL(
								track.url
							).hostname.replace(/^www\./, '')}</small
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
	<form class="add" onsubmit={add}>
		<label for={`${id}-link`}>Add a track by link</label>
		<input
			id={`${id}-link`}
			type="url"
			inputmode="url"
			placeholder="https://… an audio file or a track page"
			autocomplete="off"
			spellcheck="false"
			bind:value={link}
		/>
		<input
			type="text"
			aria-label="Track title (optional)"
			placeholder="Title (optional)"
			maxlength="200"
			bind:value={title}
		/>
		<button type="submit" disabled={!link.trim() || adding} aria-busy={adding}
			>{adding ? 'Checking…' : 'Add track'}</button
		>
		<small class="note"
			>Only the link is kept, on this phone. {creator.name} did not choose it.</small
		>
	</form>
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

	.add {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12.5px;
	}

	.add input {
		box-sizing: border-box;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 14px;
	}

	.add button {
		align-self: flex-start;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}

	.add button:disabled {
		opacity: 0.55;
	}

	.note {
		color: var(--muted);
	}
</style>
