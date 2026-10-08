<script lang="ts">
	import { relativeAge } from '$lib/feeds.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import { siteFollows, type DigestUpdate } from '$lib/siteFollows.svelte.js';
	import { hostOf } from '$lib/hosts.js';

	/**
	 * One post from a followed site in the digest: the site as the source chip, the post's title,
	 * a line or two of it, and its age. A place's post, not a person's yip, so it is a card of its
	 * own and not a YipCard. Opens the post on the site itself; this is a reader, not a destination.
	 */

	interface Props {
		update: DigestUpdate;
	}

	let { update }: Props = $props();

	const record = $derived(update.record);
	const age = $derived(relativeAge(record.publishedAt ?? record.firstSeenAt));
	const initial = $derived(update.siteTitle.trim().charAt(0).toUpperCase() || '?');

	async function open() {
		openExternal(await siteFollows.open(record));
	}
</script>

<button
	class="post"
	class:unread={update.isNew}
	onclick={open}
	aria-label={`${record.title}. From ${update.siteTitle}, ${age}. Opens on ${hostOf(record.url)}.`}
>
	<span class="src">
		<span class="icon" style:background-image={update.iconUrl ? `url(${update.iconUrl})` : ''}>
			{#if !update.iconUrl}<span aria-hidden="true">{initial}</span>{/if}
		</span>
		<span class="chip">Site</span>
		<small>{update.siteTitle}</small>
		{#if age}<small class="age">{'·'} {age}</small>{/if}
	</span>
	<span class="ttl">{record.title}</span>
	{#if record.summary}<span class="body">{record.summary}</span>{/if}
	<span class="link">
		Open on {hostOf(record.url)}
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
	</span>
</button>

<style>
	.post {
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

	.post:active {
		transform: scale(0.985);
	}

	/* A post not yet opened: the same brand edge an unread text yip and a forum topic have. */
	.post.unread::before {
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
		background-size: cover;
		background-position: center;
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

	.src small.age {
		flex: none;
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

	.body {
		display: -webkit-box;
		overflow: hidden;
		color: var(--muted);
		font-size: 14px;
		line-height: 1.45;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
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
		.post {
			transition: none;
		}
	}
</style>
