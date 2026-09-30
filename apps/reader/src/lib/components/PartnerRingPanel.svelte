<script lang="ts">
	import { previewKindOf, type PartnerRingResult, type PreviewKind } from '@yipden/ring-client';
	import { cardStack } from '$lib/actions/cardStack.js';
	import { openExternal } from '$lib/platform/external.js';
	import { shelf, toggleShelf } from '$lib/shelf.svelte.js';
	import PlatformIcon from './PlatformIcon.svelte';
	import PartnerThumb from './PartnerThumb.svelte';
	import ImagePreview from './ImagePreview.svelte';

	/**
	 * One partner ring's members, on their own screen inside Discover.
	 *
	 * Never mixed into the IndieNodes rotation: this replaces the hero while it is open, names
	 * its ring on every card, and links to that ring's own hub. A member built for desktop gets
	 * Save for later as the main action, the same rule as anywhere else in Discover, and every
	 * member still links out to its own site.
	 *
	 * Cards fold and stand the same way Feeds' yips do, through the same `cardStack` action, on
	 * `.scroll`: Feeds' own split between a fixed head and a separately scrolling pane beneath
	 * it, reused here so the "back to IndieNodes" bar stays pinned while cards move under it.
	 * Reduced motion disables the stack the same way too; the action is entirely generic to
	 * what it decorates, unaware this is a different screen than Feeds.
	 */

	interface Props {
		result: PartnerRingResult;
		onback: () => void;
	}

	let { result, onback }: Props = $props();
	let back = $state<HTMLButtonElement | undefined>(undefined);
	/**
	 * Rendered at this component's own root, outside `.scroll`'s stacked cards: see
	 * `PartnerThumb.svelte` for why a preview cannot be opened from inside one of those cards.
	 */
	let preview = $state<{ src: string; alt: string } | null>(null);

	$effect(() => {
		back?.focus();
	});

	function hostOf(url: string): string {
		return new URL(url).hostname.replace(/^www\./, '');
	}

	/**
	 * What the Listen button actually says, so a reader knows what they are about to open before
	 * they tap it: a file plays in a second, a platform page may ask for an account, and a
	 * paywalled one may ask for a subscription. Guessed from the URL alone, the same way
	 * `previewKindOf` itself is; nothing here changes what happens on tap, which is always
	 * `openExternal`, whatever the label says.
	 */
	const PREVIEW_LABELS: Record<PreviewKind, string> = {
		file: 'Listen',
		youtube: 'Watch on YouTube',
		soundcloud: 'Open on SoundCloud',
		bandcamp: 'Open on Bandcamp',
		spotify: 'Open on Spotify',
		'apple-music': 'Open on Apple Music',
		external: 'Listen'
	};

	function previewLabel(url: string): string {
		return PREVIEW_LABELS[previewKindOf(url)];
	}
</script>

<section class="partner" data-noswipe aria-label={`${result.ring.name} members`}>
	<header class="head">
		<button bind:this={back} class="back" onclick={onback}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
			IndieNodes
		</button>
		<p class="note">
			Another ring. These members are not part of Discover’s rotation, and nothing here is ranked.
		</p>
		<h2>{result.ring.name}</h2>
	</header>

	<div class="scroll" use:cardStack>
		<ul class="cards">
			{#each result.members as member (member.id)}
				{@const desktopFirst = member.layout === 'desktop-first'}
				{@const saved = shelf.has(member.url)}
				<li class="card yip-stack">
					<p class="via">
						via
						<a
							href={result.ring.hubUrl}
							target="_blank"
							rel="noopener noreferrer"
							onclick={(event) => {
								event.preventDefault();
								openExternal(result.ring.hubUrl);
							}}>{result.ring.name}</a
						>
					</p>
					<div class="title-row">
						{#if member.thumbUrl}
							<PartnerThumb
								src={member.thumbUrl}
								alt={member.name}
								onpreview={() => (preview = { src: member.thumbUrl!, alt: member.name })}
							/>
						{/if}
						<h3>{member.name}</h3>
					</div>
					{#if member.blurb}<p class="blurb">{member.blurb}</p>{/if}
					<p class="host">
						{hostOf(member.url)}{#if desktopFirst}<span class="chip">Best on desktop</span>{/if}
					</p>
					<div class="acts">
						{#if desktopFirst}
							<button
								class="primary"
								aria-pressed={saved}
								onclick={() =>
									toggleShelf({
										url: member.url,
										title: member.name,
										via: result.ring.name,
										from: 'discover'
									})}
							>
								{saved ? 'Saved to Shelf' : 'Save for later'}
							</button>
							<button
								class="secondary"
								onclick={() => openExternal(member.url)}
								aria-label={`Open ${hostOf(member.url)}`}
							>
								<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
									<circle cx="12" cy="12" r="9" />
									<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
								</svg>
								Open
							</button>
						{:else}
							<button
								class="primary"
								onclick={() => openExternal(member.url)}
								aria-label={`Visit ${hostOf(member.url)}`}
							>
								<svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
									<circle cx="12" cy="12" r="9" />
									<path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
								</svg>
								Visit
							</button>
						{/if}
						{#if member.previewUrl}
							<button
								class="secondary"
								onclick={() => openExternal(member.previewUrl!)}
								title="Their own chosen sample, opens on its own site"
							>
								<PlatformIcon kind={previewKindOf(member.previewUrl)} />
								{previewLabel(member.previewUrl)}
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</div>
</section>

{#if preview}
	<ImagePreview src={preview.src} alt={preview.alt} onclose={() => (preview = null)} />
{/if}

<style>
	.partner {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		background: var(--deep);
		color: #fff;
		user-select: text;
	}

	.head {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: calc(22px + env(safe-area-inset-top, 0px)) 20px 16px;
	}

	.back {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px 0 10px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
		font-family: var(--body);
		font-size: 14px;
		font-weight: 600;
	}

	.back svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.note {
		margin: 0;
		color: rgba(255, 255, 255, 0.88);
		font-size: 13.5px;
		line-height: 1.4;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 34px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}

	/*
	 * The scrolling half of this screen, separate from `.head` so the "back to IndieNodes" bar
	 * stays pinned while cards move underneath it: the same split Feeds' own header and `.pane`
	 * already have, reused here rather than invented fresh.
	 */
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		/*
		 * 6px of top clearance, matching Feeds' own `.pane`: the stack's IntersectionObserver
		 * shrinks its root by 4px from the top (`rootMargin`) to decide when a card has scrolled
		 * past it, and a first card sitting flush against zero padding sat inside that shrunk
		 * margin at rest, with no scrolling at all, marking it "behind" and pointer-events: none
		 * permanently. Found by a real click failing, not by inspection.
		 */
		padding: 6px 20px calc(var(--dock) + 8px);
		touch-action: pan-y;
		scrollbar-width: none;
	}

	.scroll::-webkit-scrollbar {
		display: none;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/*
	 * Opaque, not the translucent tint the rest of Discover's glass chips use: the stack below
	 * overlaps a receding card with the one rising to replace it, and a see-through card let the
	 * one behind it show straight through, which read as a visual glitch rather than one card
	 * passing behind another. `color-mix` over the panel's own solid background keeps the exact
	 * look the translucent version had at rest, just no longer literally see-through.
	 */
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px 18px;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: var(--r-card);
		background: color-mix(in srgb, #fff 7%, var(--deep));
	}

	.via {
		margin: 0;
		color: rgba(255, 255, 255, 0.88);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	/* A link that is a real 44px target, without looking like a button. */
	.via a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -14px 0;
		color: #fff;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	h3 {
		/* A flex item's default min-width is its own content size, which a long, hand-chosen
		   name can exceed: without this it overflows the card rather than wrapping inside it. */
		min-width: 0;
		margin: 0;
		font-family: var(--display);
		font-size: 24px;
		line-height: 1.05;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}

	.blurb {
		margin: 0;
		color: rgba(255, 255, 255, 0.9);
		font-size: 15px;
		line-height: 1.45;
	}

	.host {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: rgba(255, 255, 255, 0.82);
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.05em;
	}

	.chip {
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 999px;
		font-size: 10px;
		text-transform: uppercase;
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 4px;
	}

	.primary,
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 48px;
		padding: 0 18px;
		border: 0;
		border-radius: 999px;
		font-family: var(--body);
		font-size: 15px;
		font-weight: 600;
	}

	/* A fixed ink on white, as elsewhere on the always dark Discover. See DECISIONS.md. */
	.primary {
		background: #fff;
		color: #1f1410;
	}

	.primary[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.22);
		color: #fff;
	}

	.secondary {
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
	}

	/*
	 * The button used to spell out the host itself ("Visit example.com"), which repeated what
	 * `.host` right above it already says and, once a name can run long too, only added to the
	 * crowding. A globe reads as "this leaves the app" on its own; the word stays only to name
	 * the action, not the address.
	 */
	.globe {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/*
	 * The same fold and stand Feeds' own yips do, `cardStack.ts` unchanged: it only ever looks
	 * for a `.yip-stack` class on a scrolling pane's children, so applying it here is only this
	 * CSS, matching Feeds' own down to the keyframe names. Left out on purpose: Feeds' own
	 * `content-visibility`/`contain-intrinsic-size` pair, tuned to its cards' known fixed
	 * heights (200px, 172px for Listen, and so on). A member's card here varies with its own
	 * blurb length and how many action buttons wrap, and guessing a size for that risks the
	 * exact "stuck scrollable area" bug DECISIONS.md already records for Feeds' Listen pane, for
	 * a ring of at most a few dozen cards rather than the hundreds that optimization exists for.
	 */
	:global(.scroll.stack .yip-stack.behind) {
		pointer-events: none;
	}

	:global(.scroll.stack .yip-stack::after) {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: #120704;
		opacity: var(--dim, 0);
		pointer-events: none;
	}

	:global(.scroll.stack-sda .yip-stack) {
		view-timeline: --yip block;
		view-timeline-inset: 0px var(--dock);
		animation:
			yip-in linear both,
			yip-out linear forwards;
		animation-timeline: --yip, --yip;
		animation-range:
			entry 0% entry 100%,
			exit 0% exit 100%;
	}

	:global(.scroll.stack-sda .yip-stack::after) {
		animation: yip-dim linear forwards;
		animation-timeline: --yip;
		animation-range: exit 0% exit 100%;
	}

	@keyframes yip-in {
		from {
			transform-origin: 50% 100%;
			transform: perspective(1000px) translateY(24px) rotateX(14deg) scale(0.94);
			opacity: 0.5;
		}
		to {
			transform-origin: 50% 100%;
			transform: none;
			opacity: 1;
		}
	}

	@keyframes yip-out {
		from {
			transform-origin: 50% 0%;
			transform: none;
			opacity: 1;
		}
		to {
			transform-origin: 50% 0%;
			transform: perspective(1000px) translateY(100%) translateZ(-180px) rotateX(-10deg);
			opacity: 0;
		}
	}

	@keyframes yip-dim {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.6;
		}
	}
</style>
