<script lang="ts">
	import { relativeAge } from '$lib/feeds.svelte.js';
	import { forums, type DigestTopic } from '$lib/forums.svelte.js';
	import { openExternal } from '$lib/platform/external.js';

	/**
	 * One forum topic in the digest: never post by post, one card for the whole topic and what is
	 * new in it. "14 new replies · 3h ago", with the forum and its category as the source chip.
	 * Opens the topic on the forum, at the first post the reader has not seen.
	 */

	interface Props {
		topic: DigestTopic;
	}

	let { topic }: Props = $props();

	const record = $derived(topic.record);
	const age = $derived(relativeAge(record.lastActivityAt));
	const unseen = $derived(topic.isNew || topic.newReplies > 0);
	const what = $derived.by(() => {
		const replies = `${record.replyCount} ${record.replyCount === 1 ? 'reply' : 'replies'}`;
		if (topic.isNew) return record.replyCount ? `New topic · ${replies}` : 'New topic';
		if (topic.newReplies) {
			return `${topic.newReplies} new ${topic.newReplies === 1 ? 'reply' : 'replies'}`;
		}
		return `No new replies · ${replies}`;
	});
	const source = $derived(
		topic.categoryName ? `${topic.forumTitle} · ${topic.categoryName}` : topic.forumTitle
	);

	async function open() {
		openExternal(await forums.open(record));
	}
</script>

<button
	class="topic"
	class:unread={unseen}
	onclick={open}
	aria-label={`${record.title}. ${what}, ${age}. ${source}. Opens on the forum.`}
>
	<span class="src">
		<span class="icon" style:background-image={topic.logoUrl ? `url(${topic.logoUrl})` : ''}>
			{#if !topic.logoUrl}<span aria-hidden="true"
					>{topic.forumTitle.trim().charAt(0).toUpperCase() || '?'}</span
				>{/if}
		</span>
		<span class="chip">Forum</span>
		<small>{source}</small>
	</span>
	<span class="ttl">{record.title}</span>
	<span class="meta">
		<b>{what}</b>
		{#if age}<span>{'·'} {age}</span>{/if}
		{#if record.pinned}<span class="flag">Pinned</span>{/if}
		{#if record.closed}<span class="flag">Closed</span>{/if}
	</span>
	<span class="link">
		{topic.newReplies && !topic.isNew ? 'Open at the first new reply' : 'Open on the forum'}
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
	</span>
</button>

<style>
	.topic {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		margin: 0;
		padding: 16px 18px;
		border: 0;
		border-radius: var(--r-card);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		transition: transform var(--dur-s) var(--ease);
	}

	.topic:active {
		transform: scale(0.985);
	}

	/* Something not yet seen: the same brand edge an unread text yip has. */
	.topic.unread::before {
		content: '';
		position: absolute;
		top: 16px;
		bottom: 16px;
		left: 0;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--brand);
	}

	.src {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		background-color: var(--brand-soft);
		background-size: contain;
		background-position: center;
		background-repeat: no-repeat;
		color: var(--brand-ink);
		font-size: 12px;
		font-weight: 700;
	}

	.chip {
		flex: none;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-size: 11.5px;
		font-weight: 650;
	}

	.src small {
		overflow: hidden;
		color: var(--muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ttl {
		display: -webkit-box;
		overflow: hidden;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 620;
		line-height: 1.2;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
		color: var(--muted);
		font-size: 13px;
	}

	.meta b {
		color: var(--ink);
		font-weight: 600;
	}

	.topic.unread .meta b {
		color: var(--brand-text);
	}

	.flag {
		padding: 1px 7px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 11px;
	}

	.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--brand-text);
		font-size: 13px;
		font-weight: 600;
	}

	.link svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	@media (prefers-reduced-motion: reduce) {
		.topic {
			transition: none;
		}
	}
</style>
