<script lang="ts">
	import { creatorNotes, type TrackCreator } from '$lib/creatorNotes.svelte.js';
	import { showKept } from '$lib/references/messages.js';
	import { MAX_SNIP, type ReferenceKind } from '$lib/references/types.js';

	/**
	 * Keep something of a creator's by its link, from their profile or their row in You. What it is
	 * comes first, as a row of icon buttons, since creators make more than audio: a track, a comic
	 * page or picture, a game screenshot, or a passage of writing (phone feedback, 2026-10-06). The
	 * same capture rules as keeping from their page in the in-app browser, which stays the easier
	 * way; this is for a link already in hand.
	 */

	interface Props {
		creator: TrackCreator & { name: string };
		/** Distinguishes form fields when several of these are on one screen. */
		id: string;
	}

	let { creator, id }: Props = $props();

	const KINDS: Array<{ kind: ReferenceKind; label: string; icon: string }> = [
		{
			kind: 'audio',
			label: 'Track',
			icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z'
		},
		{ kind: 'image', label: 'Picture', icon: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15.5 9.5h.01' },
		{
			kind: 'screenshot',
			label: 'Screenshot',
			icon: 'M3 7h18v12H3zM8 7V5h8v2M12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'
		},
		{
			kind: 'text',
			label: 'Passage',
			icon: 'M6 8h5v5H6zM6 13c0 2-1 3-2 4M14 8h5v5h-5zM14 13c0 2-1 3-2 4'
		}
	];

	let kind = $state<ReferenceKind | null>(null);
	let link = $state('');
	let title = $state('');
	let passage = $state('');
	let adding = $state(false);

	let fields = $derived(
		kind === 'audio'
			? {
					link: 'Add a track by link',
					placeholder: 'https://… an audio file or a track page',
					submit: 'Add track'
				}
			: kind === 'text'
				? {
						link: 'The page it is on',
						placeholder: 'https://… the page with the passage',
						submit: 'Keep passage'
					}
				: {
						link: kind === 'screenshot' ? 'A screenshot by link' : 'A picture by link',
						placeholder: 'https://… the image itself',
						submit: 'Keep it'
					}
	);
	let ready = $derived(Boolean(link.trim()) && (kind !== 'text' || Boolean(passage.trim())));

	function choose(next: ReferenceKind) {
		kind = kind === next ? null : next;
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (!kind || !ready) return;
		adding = true;
		try {
			const result =
				kind === 'text'
					? await creatorNotes.keep(creator, {
							kind,
							url: link,
							selector: { exact: passage.trim().slice(0, MAX_SNIP) }
						})
					: await creatorNotes.keep(creator, { kind, url: link, title });
			if (result === 'added') {
				link = '';
				title = '';
				passage = '';
			}
			showKept(result, creator, kind);
		} finally {
			adding = false;
		}
	}
</script>

<div class="keep-by-link">
	<div class="kinds" role="radiogroup" aria-label="Keep something of theirs">
		{#each KINDS as entry (entry.kind)}
			<button
				role="radio"
				aria-checked={kind === entry.kind}
				class:on={kind === entry.kind}
				onclick={() => choose(entry.kind)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={entry.icon} /></svg>
				<span>{entry.label}</span>
			</button>
		{/each}
	</div>

	{#if kind}
		<form class="add" onsubmit={add}>
			<label for={`${id}-link`}>{fields.link}</label>
			<input
				id={`${id}-link`}
				type="url"
				inputmode="url"
				placeholder={fields.placeholder}
				autocomplete="off"
				spellcheck="false"
				bind:value={link}
			/>
			{#if kind === 'text'}
				<textarea
					aria-label="The passage, as it appears on the page"
					placeholder="The passage, as it appears on the page"
					maxlength={MAX_SNIP}
					rows="3"
					bind:value={passage}></textarea>
			{:else}
				<input
					type="text"
					aria-label={kind === 'audio' ? 'Track title (optional)' : 'Title (optional)'}
					placeholder="Title (optional)"
					maxlength="200"
					bind:value={title}
				/>
			{/if}
			<button type="submit" disabled={!ready || adding} aria-busy={adding}
				>{adding ? 'Checking…' : fields.submit}</button
			>
			<small class="note"
				>Only the link is kept, on this phone. {creator.name} did not choose it.</small
			>
		</form>
	{:else}
		<small class="note">
			Pick what it is to keep it by link. From their site, YipDen's button in the browser is easier.
		</small>
	{/if}
</div>

<style>
	.keep-by-link {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.kinds button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px 0 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
	}

	.kinds button.on {
		border-color: transparent;
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.kinds svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12.5px;
	}

	.add input,
	.add textarea {
		box-sizing: border-box;
		min-height: 44px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 14px;
	}

	.add textarea {
		resize: vertical;
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
