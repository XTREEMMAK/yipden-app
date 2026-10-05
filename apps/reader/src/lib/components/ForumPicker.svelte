<script lang="ts">
	import type { Forum, ForumCategory } from '@yipden/feeds';
	import { fly } from 'svelte/transition';
	import { flyIn } from '$lib/motion.js';
	import Switch from './Switch.svelte';

	/**
	 * What to follow of a forum: the whole of it, or chosen categories. The same toggle list the
	 * rest of Follow uses, with "Whole forum" first. The two overlap, so turning one on turns the
	 * other off: the whole forum already has every category in it.
	 *
	 * Used to follow a forum (Follow) and to change what is followed of one (You's forums screen).
	 */

	export type ForumChoice = { whole: true } | { whole: false; categories: ForumCategory[] };

	interface Props {
		forum: Forum;
		/** Null while they are being read. */
		categories: ForumCategory[] | null;
		initial?: { whole: boolean; ids: number[] };
		confirmLabel: (count: number, whole: boolean) => string;
		busy?: boolean;
		onconfirm: (choice: ForumChoice) => void;
	}

	let {
		forum,
		categories,
		initial = { whole: true, ids: [] },
		confirmLabel,
		busy = false,
		onconfirm
	}: Props = $props();

	let whole = $state(true);
	let chosen = $state<Set<number>>(new Set());
	let seeded = false;
	$effect(() => {
		if (seeded) return;
		seeded = true;
		whole = initial.whole;
		chosen = new Set(initial.ids);
	});

	const picked = $derived((categories ?? []).filter((category) => chosen.has(category.id)));
	const ready = $derived(whole || picked.length > 0);

	function setWhole(on: boolean) {
		whole = on;
		if (on) chosen = new Set();
	}

	function setCategory(category: ForumCategory, on: boolean) {
		const next = new Set(chosen);
		if (on) next.add(category.id);
		else next.delete(category.id);
		chosen = next;
		if (on) whole = false;
	}

	function confirm() {
		if (!ready || busy) return;
		onconfirm(whole ? { whole: true } : { whole: false, categories: picked });
	}
</script>

<div class="forum" in:fly={flyIn()}>
	<span class="logo" style:background-image={forum.logoUrl ? `url(${forum.logoUrl})` : ''}></span>
	<span class="copy">
		<b>{forum.title}</b>
		<small>This is a forum</small>
		{#if forum.description}<span class="desc">{forum.description}</span>{/if}
	</span>
</div>

<fieldset class="found" in:fly={flyIn({ delay: 40 })}>
	<legend class="eyebrow">What to follow</legend>
	<label class="frow" for="forum-whole">
		<span class="ft">
			<b>Whole forum</b>
			<small>Every category, as topics come and go</small>
		</span>
		<Switch id="forum-whole" label="Follow the whole forum" checked={whole} onchange={setWhole} />
	</label>
	{#if categories === null}
		<p class="note">Reading its categories{'…'}</p>
	{:else}
		{#each categories as category (category.id)}
			<label class="frow" class:sub={category.parentId !== null} for={`forum-c${category.id}`}>
				<span class="ft">
					<b>{category.name}</b>
					<small
						>{category.topicCount}
						{category.topicCount === 1 ? 'topic' : 'topics'}{category.description
							? ` · ${category.description}`
							: ''}</small
					>
				</span>
				<Switch
					id={`forum-c${category.id}`}
					label={`Follow ${category.name}`}
					checked={!whole && chosen.has(category.id)}
					onchange={(on) => setCategory(category, on)}
				/>
			</label>
		{/each}
	{/if}
</fieldset>

<button class="confirm" type="button" onclick={confirm} disabled={!ready || busy}>
	{ready ? confirmLabel(picked.length, whole) : 'Pick the whole forum or a category'}
</button>
<p class="fine">
	One card per topic, never post by post, under Forums in Feeds. Only what anyone can read; nothing
	is posted, and nobody is notified.
</p>

<style>
	.forum {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.logo {
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background-color: var(--brand-soft);
		background-position: center;
		background-size: contain;
		background-repeat: no-repeat;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.copy b {
		font-size: 16px;
		font-weight: 650;
	}

	.copy small {
		color: var(--brand-text);
		font-size: 12px;
		font-weight: 650;
	}

	.desc {
		color: var(--muted);
		font-size: 13px;
		line-height: 1.4;
	}

	.found {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.eyebrow {
		padding: 12px 14px 4px;
		color: var(--brand-text);
	}

	.frow {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 14px;
		border-top: 1px solid var(--line);
	}

	.frow.sub {
		padding-left: 30px;
	}

	.ft {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.ft b {
		font-size: 14.5px;
		font-weight: 600;
	}

	.ft small {
		overflow: hidden;
		color: var(--muted);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.note {
		margin: 0;
		padding: 12px 14px;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 13.5px;
	}

	/* Follow's own primary button, so following a forum looks like following anyone. */
	.confirm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		padding: 0 20px;
		border: 0;
		border-radius: var(--r-input);
		background: var(--brand);
		color: #fff;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
		transition: opacity var(--dur-s) var(--ease);
	}

	.confirm:disabled {
		opacity: 0.55;
	}

	.fine {
		margin: 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
</style>
