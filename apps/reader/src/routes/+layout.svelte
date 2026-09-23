<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import TabBar from '$components/TabBar.svelte';
	import { directionBetween } from '$lib/navigation.js';
	import { theme } from '$lib/theme.svelte.js';
	import '$styles/app.css';

	let { children } = $props();

	onMount(() => {
		theme.hydrate();
	});

	/**
	 * Screen transitions, through the View Transitions API.
	 *
	 * The direction is written to the document before the transition starts so the CSS in
	 * app.css knows which way to slide. Where the API is missing, this returns early and
	 * navigation happens the plain way, which is the documented fallback: a crossfade or
	 * nothing at all, never a broken animation.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (!navigation.to) return;

		const direction = directionBetween(navigation.from?.url.pathname, navigation.to.url.pathname);
		if (direction === 'none') return;

		return new Promise((resolve) => {
			document.documentElement.dataset.nav = direction;
			const transition = document.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => {
				delete document.documentElement.dataset.nav;
			});
		});
	});
</script>

<div class="app">
	{@render children()}
	<TabBar />
</div>
