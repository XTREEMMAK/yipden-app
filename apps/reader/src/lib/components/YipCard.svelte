<script lang="ts" module>
	/** Where the card not on top waits: a little smaller, set back, its top edge showing above. */
	const BEHIND =
		'perspective(900px) translate3d(0, -16px, -40px) rotate(0deg) rotateY(0deg) scale(0.95)';
	const TOP = 'perspective(900px) translate3d(0, 0, 0) rotate(0deg) rotateY(0deg) scale(1)';

	/**
	 * The post: out to the right over the video, then back and in behind it. Mostly sideways: a
	 * card near the top of Feeds has little room above it before the header.
	 */
	const POST_TUCKS_BEHIND: Keyframe[] = [
		{ offset: 0, transform: TOP, zIndex: 3 },
		{
			offset: 0.45,
			transform:
				'perspective(900px) translate3d(30%, -8%, 60px) rotate(7deg) rotateY(-18deg) scale(1)',
			zIndex: 3
		},
		{
			offset: 0.55,
			transform:
				'perspective(900px) translate3d(22%, -6%, -30px) rotate(4deg) rotateY(-12deg) scale(0.97)',
			zIndex: 1
		},
		{ offset: 1, transform: BEHIND, zIndex: 1 }
	];

	/** The video: out to the left from behind, under the post, then forward and on top. */
	/** The same path walked the other way: what puts a card back where it came from. */
	function backwards(keyframes: Keyframe[]): Keyframe[] {
		return keyframes.map((frame) => ({ ...frame, offset: 1 - (frame.offset as number) })).reverse();
	}

	const VIDEO_COMES_FORWARD: Keyframe[] = [
		{ offset: 0, transform: BEHIND, zIndex: 1 },
		{
			offset: 0.45,
			transform:
				'perspective(900px) translate3d(-24%, 6%, -30px) rotate(-6deg) rotateY(16deg) scale(0.97)',
			zIndex: 1
		},
		{
			offset: 0.55,
			transform:
				'perspective(900px) translate3d(-16%, 4%, 40px) rotate(-3deg) rotateY(10deg) scale(1)',
			zIndex: 3
		},
		{ offset: 1, transform: TOP, zIndex: 3 }
	];
</script>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { prefersReducedMotion } from '$lib/motion.js';
	import { sourceColor as sourceColorOf } from '$lib/sources.js';
	import { youtubeLinkIn } from '$lib/embeds/source.js';
	import { hostOf } from '$lib/hosts.js';
	import { youtubeVideoId } from '@yipden/feeds';
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
	import { creatorProfiles } from '$lib/creatorProfile.svelte.js';
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
	/** A YouTube video's card: it opens on YouTube, like every other post opens where it lives. */
	let youtubeId = $derived(isVideo ? youtubeVideoId(yip.url) : null);
	/**
	 * A YouTube video the post links or embeds, without being one itself (a Bluesky post sharing a
	 * video, a blog post embedding one): shown inside the post as a preview that opens on YouTube.
	 */
	let linkedVideo = $derived(
		yip.feedKind === 'youtube' || youtubeId
			? null
			: (yip.media.find((media) => media.kind === 'video' && youtubeVideoId(media.url))?.url ??
					youtubeLinkIn(yip.contentHtml, yip.summary))
	);
	let isMedia = $derived(isAudio || (isVideo && !linkedVideo) || image !== null);
	/** A post with no title of its own (Bluesky, Mastodon) is named by its words. */
	let heading = $derived(
		yip.title && yip.title !== 'Untitled' ? yip.title : yip.summary.slice(0, 140) || 'Post'
	);
	let authorName = $derived(displayAuthor(yip, feeds.personFor(yip)?.name));
	let icon = $derived(feeds.iconFor(yip));
	let sourceColor = $derived(sourceColorOf(yip.feedKind));
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
		// A video opens on YouTube: its app when installed, the browser otherwise (decided
		// 2026-10-06: the app's player is for music, not for watching).

		if (isAudio) {
			const queue = buildListenQueue(feeds.panes.listen, ring.shown);
			const index = queue.findIndex((item) => item.id === yip.key);
			if (index !== -1) {
				player.play(queue, index, event.currentTarget as HTMLElement);
				return;
			}
		}
		openExternal(yip.url);
	}

	/**
	 * A shared video lives behind the post, the same size as it, so the card never grows (it had,
	 * and a tall card cannot fit under Feeds' header). The Video button shuffles the post behind
	 * it, and Back to the post brings the post forward again (decided 2026-10-06).
	 */
	let showingVideo = $state(false);
	let videoChip = $state<HTMLButtonElement | undefined>(undefined);
	let videoOpen = $state<HTMLButtonElement | undefined>(undefined);
	let postCard = $state<HTMLElement | undefined>(undefined);
	let videoCard = $state<HTMLElement | undefined>(undefined);
	/** The two cards' swap, made once and then played forward or back from wherever it is. */
	let exchange: Animation[] = [];

	/**
	 * The post and the video trade places like two cards in a deck: the post lifts up and away,
	 * swings back and tucks in behind as the video swings forward from the other side, the two
	 * crossing over in the air. Back to the post walks the same path the other way. Under reduced
	 * motion they change places with no motion.
	 *
	 * Each way is its own animation with the same easing, so both start as briskly. The way back
	 * used to be the first one `reverse()`d, which plays its easing backwards too: a quick start
	 * became a slow one, and the post took a beat to move (phone feedback, 2026-10-07). A swap
	 * still in the air is the exception: reversing it turns it around from exactly where it is.
	 */
	async function showVideo(show: boolean) {
		if (show === showingVideo) return;
		showingVideo = show;
		if (postCard && videoCard) {
			if (exchange.some((animation) => animation.playState === 'running')) {
				for (const animation of exchange) animation.reverse();
			} else {
				const timing: KeyframeAnimationOptions = {
					duration: prefersReducedMotion() ? 1 : 620,
					easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)',
					fill: 'forwards'
				};
				// Replaced in the same frame: each new path starts where the old one left its card.
				for (const animation of exchange) animation.cancel();
				exchange = [
					postCard.animate(show ? POST_TUCKS_BEHIND : backwards(POST_TUCKS_BEHIND), timing),
					videoCard.animate(show ? VIDEO_COMES_FORWARD : backwards(VIDEO_COMES_FORWARD), timing)
				];
			}
		}
		await tick();
		(show ? videoOpen : videoChip)?.focus({ preventScroll: true });
	}

	onDestroy(() => {
		for (const animation of exchange) animation.cancel();
	});

	/** A video a post shares: opened on YouTube, like a channel's own. */
	function openVideo(watchUrl: string) {
		void feeds.markRead(yip);
		openExternal(watchUrl);
	}
</script>

{#if isMedia}
	<div class="yip-wrap">
		<button
			class="yip media"
			style:--src={sourceColor}
			class:listen={isAudio}
			class:concealed
			class:unread={!yip.readAt}
			onclick={open}
			aria-label={concealed
				? `Content warning: ${warning}. Show content.`
				: `${heading} by ${authorName}${duration ? `, ${duration}` : ''}. ${isAudio ? 'Play audio.' : youtubeId ? 'Opens on YouTube.' : `Opens on ${new URL(yip.url).hostname}.`}${imageAlt ? ` Image description: ${imageAlt}` : ''}`}
		>
			<span
				class="art"
				style:background-image={!concealed && image ? `url(${image})` : washFor(yip.key)}
				aria-hidden="true"
			></span>
			<span class="shade" aria-hidden="true"></span>
			<span class="top">
				<span class="top-av" style:background-image={icon ? `url(${icon})` : ''} aria-hidden="true">
					{#if !icon}
						<svg viewBox="0 0 24 24"
							><circle cx="12" cy="9" r="3.6" /><path
								d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"
							/></svg
						>
					{/if}
				</span>
				<span class="src">{sourceLabel(yip)}</span>
				<span class="ago">{age}</span>
			</span>
			<span class="bottom">
				<span class="txtcol">
					<span class="ttl">{concealed ? warning : heading}</span>
					<span class="meta">
						{concealed ? 'Tap to show' : authorName}{!concealed && duration ? ` · ${duration}` : ''}
					</span>
				</span>
				<span
					class="go"
					class:play={(isAudio || youtubeId !== null) && !concealed}
					class:warning={concealed}
					aria-hidden="true"
				>
					{#if concealed}
						<svg viewBox="0 0 24 24"
							><path
								d="M12 9v4M12 17h.01M10.3 4.2 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.2a2 2 0 0 0-3.4 0Z"
							/></svg
						>
					{:else if isAudio || youtubeId}
						<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
					{:else}
						<svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></svg>
					{/if}
				</span>
			</span>
		</button>
		{@render profileButton('media')}
	</div>
{:else}
	<div class="yip-wrap" class:has-video={linkedVideo && !concealed}>
		<div
			class="yip text"
			style:--src={sourceColor}
			class:concealed
			class:unread={!yip.readAt}
			class:showing-video={showingVideo}
			bind:this={postCard}
			inert={showingVideo}
		>
			<!-- The post itself: the whole card, under the buttons drawn over it. -->
			<button
				class="yip-hit"
				onclick={open}
				aria-label={concealed
					? `Content warning: ${warning}. Show post.`
					: `${yip.title && yip.title !== 'Untitled' ? `${yip.title}. ` : ''}Post by ${authorName} on ${sourceLabel(yip)}. Opens on ${new URL(yip.url).hostname}.`}
			></button>
			<!-- The post: everything a reader sees first, shuffled behind the video when they ask. -->
			<span class="front">
				<span class="who">
					<span class="av" style:background-image={icon ? `url(${icon})` : ''}></span>
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
				<span class="foot">
					{#if concealed}
						<span class="link">Show post</span>
					{:else}
						<span class="link">
							Open on {hostOf(yip.url)}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
						</span>
					{/if}
					{#if linkedVideo && !concealed}
						<button
							bind:this={videoChip}
							class="video-chip"
							aria-label={`Show the video ${authorName} shared`}
							onclick={() => showVideo(true)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10l8-5z" /></svg>
							Video
						</button>
					{/if}
				</span>
			</span>
		</div>
		{#if linkedVideo && !concealed}
			{@const id = youtubeVideoId(linkedVideo)}
			<!-- The video they shared: a card of its own, waiting behind the post in the deck. -->
			<div
				class="video-card"
				class:in-front={showingVideo}
				bind:this={videoCard}
				inert={!showingVideo}
				aria-hidden={!showingVideo}
			>
				<button
					bind:this={videoOpen}
					class="video-open"
					style:background-image={`url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`}
					aria-label={`Watch the video ${authorName} shared, on YouTube`}
					onclick={() => openVideo(linkedVideo!)}
				>
					<svg class="play" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10l8-5z" /></svg>
					<span class="video-meta">
						<b
							>{yip.media.find((media) => media.kind === 'video')?.title ??
								'A video they shared'}</b
						>
						<small>YouTube · Opens there</small>
					</span>
				</button>
				<button class="video-back" aria-label="Back to the post" onclick={() => showVideo(false)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
				</button>
			</div>
		{/if}
		{#if !showingVideo}{@render profileButton('text')}{/if}
	</div>
{/if}

<!--
	The creator's picture opens their profile. A sibling laid over the card's own picture, not a
	button inside the card's, which a button cannot hold: the rest of the card still opens the post.
-->
{#snippet profileButton(shape: 'text' | 'media')}
	{@const person = feeds.personFor(yip)}
	{#if person}
		<button
			class="av-hit {shape}"
			aria-label={`${person.name}'s profile`}
			onclick={() => creatorProfiles.open({ url: person.siteUrl, name: person.name, artUrl: icon })}
		></button>
	{/if}
{/snippet}

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

	button.yip:active,
	.yip:has(> .yip-hit:active) {
		transform: scale(0.985);
	}

	/* A text card's tap target: the whole card, with its words drawn over it and not taking taps. */
	.yip-hit {
		position: absolute;
		inset: 0;
		z-index: 0;
		width: 100%;
		border: 0;
		padding: 0;
		background: none;
		border-radius: inherit;
	}

	/* Drawn over the tap target, taking no taps of its own but for its buttons. */
	.yip.text > :not(.yip-hit) {
		position: relative;
		pointer-events: none;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.video-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		margin-top: 12px;
		padding: 0 14px 0 10px;
		border: 0;
		border-radius: 999px;
		/* Solid YouTube red: a tint of it read as a faint label on a dark card (2026-10-07). */
		background: var(--src-youtube);
		color: #fff;
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		pointer-events: auto;
	}

	.video-chip svg {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/*
	 * A card with a video carries two cards, the post on top. The one behind shows its top edge
	 * above the post, so there is plainly something more here; `showVideo` swaps them.
	 */
	.has-video > .yip.text {
		z-index: 3;
	}

	.has-video > .av-hit {
		z-index: 4;
	}

	.video-card {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: var(--r-card);
		background: #000;
		box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.6);
		overflow: hidden;
		transform: perspective(900px) translate3d(0, -16px, -40px) scale(0.95);
	}

	.video-open {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border: 0;
		padding: 0;
		background-color: #000;
		background-size: cover;
		background-position: center;
		color: #fff;
		font: inherit;
		text-align: left;
	}

	.video-open .play {
		width: 56px;
		height: 56px;
		padding: 14px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.6);
		fill: #fff;
	}

	/*
	 * The picture as glass: the thumbnail blurred and darkened under everything drawn on it. Heavy
	 * while the video waits behind its post, where only a strip of it shows above the post and a
	 * busy picture there pulled the eye off the post's text; light once it is in front, so the
	 * picture still says what the video is (phone feedback, 2026-10-07). Scaled up a little so the
	 * blur's soft edge stays outside the card.
	 */
	.video-open::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: inherit;
		background-size: cover;
		background-position: center;
		filter: blur(18px) brightness(0.55);
		transform: scale(1.15);
		pointer-events: none;
	}

	.video-card.in-front .video-open::before {
		filter: blur(6px) brightness(0.6);
	}

	.video-open > :global(*) {
		position: relative;
	}

	.video-open .video-meta {
		position: absolute;
	}

	/*
	 * The title on a frosted band rather than straight on the picture, which a busy first frame
	 * made hard to read (phone feedback, 2026-10-07). The blur is only on while the video is in
	 * front: a card waiting behind every such post would otherwise blur under each scroll.
	 */
	.video-meta {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px 16px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.7));
	}

	.video-card.in-front .video-meta {
		-webkit-backdrop-filter: blur(24px);
		backdrop-filter: blur(24px);
	}

	.video-meta b {
		font-size: 14px;
		font-weight: 650;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-meta small {
		font-size: 12px;
		opacity: 0.85;
	}

	/* Top right: the top left is the creator's picture, which opens their profile. */
	.video-back {
		position: absolute;
		top: 10px;
		right: 10px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
	}

	.video-back svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
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

	/*
	 * Over the picture: the theme's own deep color laid evenly across it, then the theme's scrim.
	 * Pictures read too bright under the scrim alone, and the card's text hard to read on them
	 * (phone feedback, 2026-10-07). A tint rather than a filter on the picture, so the stack has
	 * nothing more to repaint as cards fold.
	 */
	.shade {
		position: absolute;
		inset: 0;
		background:
			var(--scrim-card), linear-gradient(rgba(var(--deep-rgb), 0.42), rgba(var(--deep-rgb), 0.42));
	}

	.top {
		position: absolute;
		top: 14px;
		left: 16px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.yip-wrap {
		position: relative;
	}

	/* Over the card's own picture, at a full 44px target; the picture stays the card's to draw. */
	.av-hit {
		position: absolute;
		z-index: 1;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		padding: 0;
		background: transparent;
	}

	.av-hit.text {
		top: 13px;
		left: 19px;
	}

	.av-hit.media {
		top: 5px;
		left: 7px;
	}

	.av-hit:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: -6px;
	}

	/* The channel's or creator's own picture, beside where it came from. */
	.top-av {
		display: grid;
		place-items: center;
		background-color: rgba(255, 255, 255, 0.22);
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background-size: cover;
		background-position: center;
		box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.7);
	}

	.top-av svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: #fff;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.top .ago {
		margin-left: auto;
	}

	.src {
		padding: 5px 9px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--src, transparent) 78%, rgba(0, 0, 0, 0.25));
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

	/*
	 * An unread yip rings its creator's picture, and the ring pulses outward. It was a dot in the
	 * card's corner, which sat on top of the post's age and was easy to miss (phone feedback,
	 * 2026-10-07). Transform and opacity only, and still under reduced motion.
	 */
	.yip.unread .av,
	.yip.unread .top-av {
		position: relative;
		box-shadow:
			0 0 0 2px var(--brand),
			0 0 0 4px color-mix(in srgb, var(--brand) 25%, transparent);
	}

	.yip.unread .av::after,
	.yip.unread .top-av::after {
		content: '';
		position: absolute;
		inset: -2px;
		box-sizing: border-box;
		border: 2px solid var(--brand);
		border-radius: 50%;
		opacity: 0;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.yip.unread .av::after,
		.yip.unread .top-av::after {
			animation: unread-ring 2.4s ease-out infinite;
		}
	}

	@keyframes unread-ring {
		0% {
			transform: scale(1);
			opacity: 0.75;
		}
		70%,
		100% {
			transform: scale(1.7);
			opacity: 0;
		}
	}

	.yip.text {
		padding: 16px 18px;
		border: 1px solid var(--line);
		/*
		 * The source's color down the leading edge, as the border itself: it always runs the
		 * card's full height. A positioned stripe did not inside a button whose drawing Feeds
		 * defers (content-visibility), where it sometimes stopped at the top (phone feedback).
		 */
		border-left: 4px solid var(--src, var(--src-other));
		padding-left: 15px;
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
		background: color-mix(in srgb, var(--src, var(--src-other)) 16%, transparent);
		color: color-mix(in srgb, var(--src, var(--src-other)) 75%, var(--ink));
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
