<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { partners } from '$lib/partnerRings.svelte.js';

	/**
	 * The four tabs, as real links.
	 *
	 * Links rather than buttons because they navigate: the back gesture, long press to open,
	 * and every assistive technology already know what a link does. `aria-current` marks the
	 * active one, and the styling hangs off that rather than off a separate class, so the
	 * visual state and the announced state cannot drift apart.
	 */
	const tabs = [
		{ href: '/', label: 'Discover' },
		{ href: '/feeds', label: 'Yips' },
		{ href: '/follow', label: 'Follow' },
		{ href: '/you', label: 'You' }
	] as const;

	/**
	 * Where the reader is headed, not only where they are. A tap answers at once: the indicator
	 * starts sliding and the tab is marked current the moment the navigation begins, rather than
	 * after the next screen has finished rendering, which on a phone is the bulk of the wait
	 * between tapping and seeing anything happen. It answers even earlier than that: on finger
	 * down, before the click that starts the navigation (rendering is frozen once a screen
	 * transition begins, so this is the only moment the bar can visibly react), and it takes the
	 * answer back if the finger slides off the tab instead of lifting on it.
	 */
	let pressed = $state<string | null>(null);
	/** When a pointer tap last navigated, so the click that may follow it can be ignored. */
	let navigatedByPointerAt = 0;
	let pathname = $derived(navigating?.to?.url.pathname ?? pressed ?? page.url.pathname);

	// Once a navigation lands, the page itself is the source of truth again.
	$effect(() => {
		void page.url.pathname;
		pressed = null;
	});

	/** Discover is a full bleed dark hero, so the bar goes translucent dark over it. */
	let onDark = $derived(pathname === '/');
	/**
	 * Over a partner ring the bar sits on cards that scroll and tilt under it, not a still photo,
	 * and a backdrop blur over moving content is recomputed every frame: solid there instead.
	 */
	let solid = $derived(onDark && partners.selected !== null);

	function isCurrent(href: string): boolean {
		return href === '/' ? pathname === '/' : pathname.startsWith(href);
	}

	/**
	 * One indicator that slides to the current tab, like the pill in Feeds, instead of each tab
	 * lighting and dimming on its own. Placed from the icons' measured positions rather than from
	 * assumed widths, and not animated until it has been placed once, so it never slides in from
	 * the corner on first paint.
	 */
	let iconEls: HTMLElement[] = [];
	let indicator = $state({ left: 0, top: 0, width: 0, height: 0, placed: false });
	let animate = $state(false);

	function place() {
		const at = tabs.findIndex((tab) => isCurrent(tab.href));
		const el = iconEls[at];
		if (!el) return;
		indicator = {
			left: el.offsetLeft,
			top: el.offsetTop,
			width: el.offsetWidth,
			height: el.offsetHeight,
			placed: true
		};
	}

	$effect(() => {
		void pathname;
		place();
	});

	onMount(() => {
		place();
		const settle = requestAnimationFrame(() => (animate = true));
		window.addEventListener('resize', place);
		return () => {
			cancelAnimationFrame(settle);
			window.removeEventListener('resize', place);
		};
	});
</script>

<nav class="tabbar" class:dark={onDark} class:solid aria-label="Main">
	<span
		class="ind"
		class:animate
		aria-hidden="true"
		style:opacity={indicator.placed ? 1 : 0}
		style:width={`${indicator.width}px`}
		style:height={`${indicator.height}px`}
		style:transform={`translate(${indicator.left}px, ${indicator.top}px)`}
	></span>
	{#each tabs as tab, index (tab.href)}
		<a
			class="tab"
			href={tab.href}
			aria-current={isCurrent(tab.href) ? 'page' : undefined}
			onpointerdown={(event) => {
				if (event.isPrimary && event.button === 0) pressed = tab.href;
			}}
			onpointerup={(event) => {
				const link = event.currentTarget;
				const under = document.elementFromPoint(event.clientX, event.clientY);
				// A finger that slid off before lifting is not a tap: no click, and the answer the
				// indicator gave on finger down is taken back.
				if (!link.contains(under)) {
					pressed = null;
					return;
				}
				// Navigate here, on the lift, rather than waiting for the browser to make a click of
				// it. After a swipe on Discover the browser sometimes never produced that click for a
				// tap made soon afterwards, and the tab did nothing until it was tried a second time.
				const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
				const here = page.url.pathname.replace(/\/$/, '') || '/';
				if (event.isPrimary && event.button === 0 && plain && tab.href !== here) {
					navigatedByPointerAt = performance.now();
					void goto(tab.href, { noScroll: true });
				}
			}}
			onclick={(event) => {
				// The click that follows a pointer tap that already navigated would navigate again.
				if (performance.now() - navigatedByPointerAt < 600) event.preventDefault();
			}}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') pressed = null;
			}}
			onpointercancel={() => (pressed = null)}
			data-sveltekit-noscroll
			data-sveltekit-preload-code="eager"
		>
			<span class="ic" bind:this={iconEls[index]} aria-hidden="true">
				{#if tab.label === 'Discover'}
					<svg viewBox="0 0 24 24"
						><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg
					>
				{:else if tab.label === 'Yips'}
					<svg viewBox="0 0 24 24"
						><path d="M3.5 10v4h3.2l7.3 4.5v-13L6.7 10z" /><path
							d="M7.2 14.2l1.2 5h2.4l-1-3.6"
						/><path d="M17 9.2a4 4 0 0 1 0 5.6M19.6 6.6a8 8 0 0 1 0 10.8" /></svg
					>
				{:else if tab.label === 'Follow'}
					<svg viewBox="0 0 24 24"
						><circle cx="10" cy="8" r="4" /><path
							d="M3 21c1.2-3.8 3.8-5.5 7-5.5 1.3 0 2.5.3 3.5.8"
						/><path d="M18 14v6M15 17h6" /></svg
					>
				{:else}
					<svg viewBox="0 0 24 24"
						><circle cx="12" cy="8.5" r="3.8" /><path
							d="M4.5 20.5c1.3-3.9 4.1-5.8 7.5-5.8s6.2 1.9 7.5 5.8"
						/></svg
					>
				{/if}
			</span>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: absolute;
		inset: auto 0 0 0;
		z-index: 20;
		display: flex;
		justify-content: space-around;
		align-items: flex-start;
		box-sizing: content-box;
		height: var(--tabbar-h);
		padding: 8px 8px env(safe-area-inset-bottom, 0px);
		background: var(--surface);
		border-top: 1px solid var(--line);
		transition:
			background var(--dur-m) var(--ease),
			border-color var(--dur-m) var(--ease);
	}

	/*
	 * The one place a backdrop filter is allowed: a small, static surface that never moves or
	 * scrolls. Anywhere else it costs frames on a mid range phone.
	 */
	.tabbar.dark {
		background: rgba(var(--deep-rgb), 0.62);
		border-color: rgba(255, 255, 255, 0.08);
		-webkit-backdrop-filter: blur(18px);
		backdrop-filter: blur(18px);
	}

	.tabbar.dark.solid {
		background: var(--deep);
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}

	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 76px;
		height: 58px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font-family: var(--body);
		font-size: 11.5px;
		font-weight: 500;
		text-decoration: none;
		transition: color var(--dur-m) var(--ease);
	}

	.ic {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 52px;
		height: 32px;
		border-radius: 999px;
	}

	.ind {
		position: absolute;
		top: 0;
		left: 0;
		border-radius: 999px;
		background: var(--brand-soft);
		transition: background var(--dur-m) var(--ease);
	}

	.ind.animate {
		transition:
			transform var(--dur-m) var(--ease),
			width var(--dur-m) var(--ease),
			background var(--dur-m) var(--ease);
	}

	.ic svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.tab[aria-current='page'] {
		color: var(--brand-text);
		font-weight: 650;
	}

	.tabbar.dark .tab {
		color: rgba(255, 255, 255, 0.74);
	}

	.tabbar.dark .tab[aria-current='page'] {
		color: #fff;
	}

	.tabbar.dark .ind {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
