<script lang="ts">
	import { page } from '$app/state';

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
		{ href: '/today', label: 'Today' },
		{ href: '/follow', label: 'Follow' },
		{ href: '/you', label: 'You' }
	] as const;

	/** Discover is a full bleed dark hero, so the bar goes translucent dark over it. */
	let onDark = $derived(page.url.pathname === '/');

	function isCurrent(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<nav class="tabbar" class:dark={onDark} aria-label="Main">
	{#each tabs as tab (tab.href)}
		<a
			class="tab"
			href={tab.href}
			aria-current={isCurrent(tab.href) ? 'page' : undefined}
			data-sveltekit-noscroll
		>
			<span class="ic" aria-hidden="true">
				{#if tab.label === 'Discover'}
					<svg viewBox="0 0 24 24"
						><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg
					>
				{:else if tab.label === 'Today'}
					<svg viewBox="0 0 24 24"
						><rect x="4" y="4" width="16" height="7" rx="2.5" /><rect
							x="4"
							y="14"
							width="16"
							height="6"
							rx="2.5"
						/></svg
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
		background: rgba(26, 9, 3, 0.62);
		border-color: rgba(255, 255, 255, 0.08);
		-webkit-backdrop-filter: blur(18px);
		backdrop-filter: blur(18px);
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
		display: grid;
		place-items: center;
		width: 52px;
		height: 32px;
		border-radius: 999px;
		transition: background var(--dur-m) var(--ease);
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

	.tab[aria-current='page'] .ic {
		background: var(--brand-soft);
	}

	.tabbar.dark .tab {
		color: rgba(255, 255, 255, 0.74);
	}

	.tabbar.dark .tab[aria-current='page'] {
		color: #fff;
	}

	.tabbar.dark .tab[aria-current='page'] .ic {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
