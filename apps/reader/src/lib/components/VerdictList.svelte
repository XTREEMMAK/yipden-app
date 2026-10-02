<script lang="ts">
	import { goto } from '$app/navigation';
	import { openExternal } from '$lib/platform/external.js';
	import type { VerdictRecord } from '$lib/store/index.js';
	import { verdicts } from '$lib/verdicts.svelte.js';

	/**
	 * Liked or Not for me, as rows: the creator's badge when one was saved with the verdict, their
	 * name and where they were found, and the row's own actions. `YouLists` decides which and how
	 * many.
	 */

	interface Props {
		kind: 'liked' | 'hidden';
		items: VerdictRecord[];
	}

	let { kind, items }: Props = $props();
	/** Badges that failed to load, so a broken one leaves the row as if it had none. */
	let broken = $state<Set<string>>(new Set());

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}
</script>

{#each items as item (item.id)}
	<div class="srow">
		<button class="open" onclick={() => openExternal(item.url)} aria-label={`Open ${item.name}`}>
			{#if item.thumbUrl && !broken.has(item.id)}
				<img
					class="badge"
					src={item.thumbUrl}
					alt=""
					aria-hidden="true"
					loading="lazy"
					decoding="async"
					referrerpolicy="no-referrer"
					onerror={() => (broken = new Set(broken).add(item.id))}
				/>
			{/if}
			<span class="tt">
				<b>{item.name}</b>
				<small>{item.via ? `via ${item.via} · ` : ''}{hostOf(item.url)}</small>
			</span>
		</button>
		{#if kind === 'liked'}
			<button class="mini-btn" onclick={() => goto(`/follow?url=${encodeURIComponent(item.url)}`)}>
				Follow
			</button>
		{/if}
		<button class="mini-btn" onclick={() => verdicts.clear(item.url)}>
			{kind === 'liked' ? 'Remove' : 'Bring back'}
		</button>
	</div>
{/each}

<style>
	.srow {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 64px;
		box-sizing: border-box;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--ink);
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
	}

	.open {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		font: inherit;
	}

	/*
	 * A badge is whatever the ring published: an 88×31 webring button or square cover art. Kept
	 * at a small button size either way (an 88×31 button shows at 64 wide, leaving the name room) and never stretched, so pixel art stays crisp and art stays whole.
	 */
	.badge {
		flex: 0 0 auto;
		max-width: 64px;
		max-height: 32px;
		border-radius: 4px;
		object-fit: contain;
		image-rendering: auto;
	}

	.tt {
		flex: 1;
		min-width: 0;
	}

	.srow b {
		display: block;
		overflow: hidden;
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.srow small {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-btn {
		flex: 0 0 auto;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: inherit;
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}
</style>
