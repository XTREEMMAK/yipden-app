<script lang="ts">
	import { player } from '$lib/player.svelte.js';
	import { buildListenQueue } from '$lib/queue.js';
	import { ring } from '$lib/ring.svelte.js';
	import { washFor } from '$lib/ring.svelte.js';
	import {
		displayAuthor,
		feeds,
		formatDuration,
		mediaDuration,
		relativeAge,
		sourceLabel
	} from '$lib/feeds.svelte.js';
	import { openExternal } from '$lib/platform/external.js';
	import type { StoredYip } from '$lib/store/index.js';

	/**
	 * One yip, in one of the two shapes the brief specifies.
	 *
	 * A media card when the yip has an image, audio or video; a text card otherwise, for a
	 * plain social post. The distinction is what the yip actually is, not which filter pane it
	 * is showing in, so a photo post in Posts and a photo post nobody has filtered to look the
	 * same either place.
	 */

	interface Props {
		yip: StoredYip;
	}

	let { yip }: Props = $props();

	let imageAttachment = $derived(yip.media.find((media) => media.kind === 'image') ?? null);
	let image = $derived(imageAttachment?.url ?? null);
	let imageAlt = $derived(imageAttachment?.alt ?? '');
	let isAudio = $derived(yip.category === 'listen');
	let isVideo = $derived(yip.category === 'watch');
	let isMedia = $derived(isAudio || isVideo || image !== null);
	let authorName = $derived(displayAuthor(yip, feeds.personFor(yip)?.name));
	let duration = $derived(formatDuration(mediaDuration(yip)));
	let age = $derived(relativeAge(yip.publishedAt));
	let revealed = $state(false);
	let concealed = $derived((yip.sensitive === true || Boolean(yip.contentWarning)) && !revealed);
	let warning = $derived(yip.contentWarning || 'Sensitive media');

	/**
	 * The first activation reveals warned content. After that, audio opens the player and every
	 * other yip opens its source URL; video is deliberately presented as an external action.
	 */
	function open(event: MouseEvent) {
		if (concealed) {
			revealed = true;
			return;
		}
		void feeds.markRead(yip);
		if (isAudio) {
			const queue = buildListenQueue(feeds.panes.listen, ring.all);
			const index = queue.findIndex((item) => item.id === yip.key);
			if (index !== -1) {
				player.play(queue, index, event.currentTarget as HTMLElement);
				return;
			}
		}
		openExternal(yip.url);
	}
</script>

{#if isMedia}
	<button
		class="yip media"
		class:listen={isAudio}
		class:concealed
		class:unread={!yip.readAt}
		onclick={open}
		aria-label={concealed
			? `Content warning: ${warning}. Show content.`
			: `${yip.title} by ${authorName}${duration ? `, ${duration}` : ''}. ${isAudio ? 'Play audio.' : `Opens on ${new URL(yip.url).hostname}.`}${imageAlt ? ` Image description: ${imageAlt}` : ''}`}
	>
		<span
			class="art"
			style:background-image={!concealed && image ? `url(${image})` : washFor(yip.key)}
			aria-hidden="true"
		></span>
		<span class="shade" aria-hidden="true"></span>
		<span class="top">
			<span class="src">{sourceLabel(yip)}</span>
			<span class="ago">{age}</span>
		</span>
		<span class="bottom">
			<span class="txtcol">
				<span class="ttl">{concealed ? warning : yip.title}</span>
				<span class="meta">
					{concealed ? 'Tap to show' : authorName}{!concealed && duration ? ` · ${duration}` : ''}
				</span>
			</span>
			<span
				class="go"
				class:play={isAudio && !concealed}
				class:warning={concealed}
				aria-hidden="true"
			>
				{#if concealed}
					<svg viewBox="0 0 24 24"
						><path
							d="M12 9v4M12 17h.01M10.3 4.2 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.2a2 2 0 0 0-3.4 0Z"
						/></svg
					>
				{:else if isAudio}
					<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
				{:else}
					<svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></svg>
				{/if}
			</span>
		</span>
	</button>
{:else}
	<button
		class="yip text"
		class:concealed
		class:unread={!yip.readAt}
		onclick={open}
		aria-label={concealed
			? `Content warning: ${warning}. Show post.`
			: `${yip.title && yip.title !== 'Untitled' ? `${yip.title}. ` : ''}Post by ${authorName} on ${sourceLabel(yip)}. Opens on ${new URL(yip.url).hostname}.`}
	>
		<span class="who">
			<span
				class="av"
				style:background-image={feeds.personFor(yip)?.iconUrl
					? `url(${feeds.personFor(yip)?.iconUrl})`
					: ''}
			></span>
			<span class="wn">
				<b>{authorName}</b>
				<small>{sourceLabel(yip)} {'·'} {age}</small>
			</span>
			<span class="src-light">{sourceLabel(yip)}</span>
		</span>
		{#if !concealed && yip.title && yip.title !== 'Untitled'}
			<span class="ttl-text">{yip.title}</span>
		{/if}
		<span class="body">{concealed ? warning : yip.summary}</span>
		{#if concealed}
			<span class="link">Show post</span>
		{:else}
			<span class="link">
				Open on {new URL(yip.url).hostname.replace(/^www\./, '')}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
			</span>
		{/if}
	</button>
{/if}

<style>
	.yip {
		position: relative;
		display: block;
		width: 100%;
		flex: 0 0 auto;
		margin: 0;
		border: 0;
		padding: 0;
		border-radius: var(--r-card);
		background: var(--surface);
		text-align: left;
		overflow: hidden;
		transition: transform var(--dur-s) var(--ease);
	}

	.yip:active {
		transform: scale(0.985);
	}

	.yip.media {
		height: 200px;
		color: #fff;
		background: var(--deep);
	}

	.yip.media.listen {
		height: 172px;
	}

	.art {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
	}

	.shade {
		position: absolute;
		inset: 0;
		background: var(--scrim-card);
	}

	.top {
		position: absolute;
		top: 14px;
		left: 16px;
		right: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.src {
		padding: 5px 9px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}

	.ago {
		font-family: var(--mono);
		font-size: 11px;
		color: rgba(255, 255, 255, 0.88);
	}

	.bottom {
		position: absolute;
		left: 18px;
		right: 16px;
		bottom: 16px;
		display: flex;
		align-items: flex-end;
		gap: 14px;
	}

	.txtcol {
		flex: 1;
		min-width: 0;
	}

	.ttl {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-family: var(--display);
		font-size: 21px;
		line-height: 1.08;
		font-weight: 620;
		letter-spacing: -0.012em;
		text-wrap: balance;
	}

	.listen .ttl {
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.meta {
		display: block;
		margin-top: 6px;
		color: rgba(255, 255, 255, 0.85);
		font-size: 12.5px;
	}

	.go {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: #fff;
		color: var(--ink);
	}

	.go.play {
		color: var(--brand);
	}

	.go svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	.go:not(.play) svg,
	.go.warning svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.concealed .art {
		filter: saturate(0.45) brightness(0.65);
	}

	/* A small dot for an unread yip, the same idea the tab bar's badge would use. */
	.yip.unread::before {
		content: '';
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 1;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--brand);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
	}

	.yip.text.unread::before {
		top: 16px;
		right: 16px;
		box-shadow: none;
	}

	.yip.text {
		padding: 16px 18px;
		border: 1px solid var(--line);
		color: var(--ink);
	}

	.who {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.av {
		flex: 0 0 auto;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
	}

	.wn {
		flex: 1;
		min-width: 0;
	}

	.who b {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
	}

	.who small {
		display: block;
		margin-top: 1px;
		color: var(--muted);
		font-size: 12.5px;
	}

	.src-light {
		padding: 5px 9px;
		border-radius: 999px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.ttl-text {
		display: block;
		margin-top: 12px;
		font-family: var(--display);
		font-size: 17px;
		font-weight: 620;
		letter-spacing: -0.01em;
	}

	.body {
		display: block;
		font-size: 15.5px;
		line-height: 1.45;
	}

	/* 12px under the who row when there is no title above it; 4px when there is one. */
	.who + .body {
		margin-top: 12px;
	}

	.ttl-text + .body {
		margin-top: 4px;
	}

	.link {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
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
</style>
