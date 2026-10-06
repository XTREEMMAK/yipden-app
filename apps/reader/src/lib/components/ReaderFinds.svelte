<script lang="ts">
	import { hostOf } from '$lib/hosts.js';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { siteBrowser } from '$lib/platform/siteBrowser.svelte.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import type { Reference, RingOrigin } from '$lib/references/types.js';
	import ImagePreview from './ImagePreview.svelte';

	/**
	 * Pictures and passages a reader kept from a creator's pages. Pointers, never copies: a picture
	 * is loaded live from the creator's host each time it is shown, and a passage opens their page
	 * scrolled to it. Something their site no longer has stays listed, marked, so it can be removed.
	 */

	interface Props {
		creator: { url: string; name: string; artUrl?: string | null; ring?: RingOrigin | null };
		/** Called as a page opens, so a sheet holding this list can get out of its way. */
		onopen?: () => void;
	}

	let { creator, onopen }: Props = $props();

	let pictures = $derived(
		creatorNotes
			.referencesFor(creator.url)
			.filter((entry) => entry.kind === 'image' || entry.kind === 'screenshot')
	);
	let passages = $derived(creatorNotes.referencesFor(creator.url, 'text'));
	let preview = $state<Reference | null>(null);

	const KIND_LABELS = { image: 'Picture', screenshot: 'Screenshot' } as const;

	function show(picture: Reference) {
		void creatorNotes.recheckOnOpen(picture.id);
		preview = picture;
	}

	function open(passage: Reference) {
		void creatorNotes.recheckOnOpen(passage.id);
		onopen?.();
		// Always out to the creator's own page: the passage is theirs, read where they put it.
		void siteBrowser.open(passage.textFragmentUrl ?? passage.url, creator, prefs.sitesInApp);
	}
</script>

{#if pictures.length || passages.length}
	<div class="reader-finds">
		{#if pictures.length}
			<ul class="pictures" aria-label={`Pictures you kept from ${creator.name}`}>
				{#each pictures as picture (picture.id)}
					<li class="picture" class:gone={picture.status === 'gone'}>
						{#if picture.status === 'gone'}
							<span class="missing">No longer on their site</span>
						{:else}
							<button
								class="thumb"
								aria-label={`Show ${picture.title} full screen`}
								onclick={() => show(picture)}
							>
								<img
									src={picture.url}
									alt=""
									referrerpolicy="no-referrer"
									loading="lazy"
									decoding="async"
								/>
							</button>
						{/if}
						<span class="meta">
							<small>{KIND_LABELS[picture.kind as 'image' | 'screenshot']} · Added by you</small>
							<button
								class="remove"
								aria-label={`Remove ${picture.title}`}
								onclick={() => creatorNotes.removeReference(picture.id)}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
							</button>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if passages.length}
			<ul class="passages" aria-label={`Passages you kept from ${creator.name}`}>
				{#each passages as passage (passage.id)}
					<li class="passage">
						<button
							class="quote"
							disabled={passage.status === 'gone'}
							aria-label={passage.status === 'gone'
								? `A passage no longer on their page: ${passage.title}`
								: `Read this passage on their page: ${passage.title}`}
							onclick={() => open(passage)}
						>
							<blockquote>{passage.selector?.exact ?? passage.title}</blockquote>
							<small
								>{passage.status === 'gone' ? 'No longer on their page' : 'Added by you'} · {hostOf(
									passage.url
								)}</small
							>
						</button>
						<button
							class="remove"
							aria-label={`Remove the passage ${passage.title}`}
							onclick={() => creatorNotes.removeReference(passage.id)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

{#if preview}
	<ImagePreview src={preview.url} alt={preview.title} onclose={() => (preview = null)} />
{/if}

<style>
	.reader-finds {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pictures {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 8px;
	}

	.picture {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.thumb {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface);
	}

	.thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.missing {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		padding: 6px;
		border: 1px dashed var(--line);
		border-radius: 10px;
		color: var(--muted);
		font-size: 12px;
		text-align: center;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}

	small {
		color: var(--muted);
		font-size: 12px;
	}

	.passages {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.passage {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.quote {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		min-height: 44px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.quote:disabled {
		color: var(--muted);
	}

	blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 3px solid var(--brand);
		font-size: 14px;
		line-height: 1.45;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.remove {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: none;
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
</style>
