<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { App } from '@capacitor/app';
	import { onMount } from 'svelte';
	import MiniPlayer from '$components/MiniPlayer.svelte';
	import Player from '$components/Player.svelte';
	import TabBar from '$components/TabBar.svelte';
	import { directionBetween } from '$lib/navigation.js';
	import { player } from '$lib/player.svelte.js';
	import { ring } from '$lib/ring.svelte.js';
	import { ringPlayer, type RingQueueRecord } from '$lib/ringPlayer.svelte.js';
	import { store } from '$lib/store/index.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { theme } from '$lib/theme.svelte.js';
	import { verdicts } from '$lib/verdicts.svelte.js';
	import '$styles/app.css';

	let { children } = $props();
	let ringQueueRestored = $state(false);

	onMount(() => {
		theme.hydrate();
		void prefs.hydrate();
		void verdicts.load();
		void restoreRingQueue();
		const stopResume = watchResume();
		const stopKeyboard = watchKeyboard();
		return () => {
			stopResume();
			stopKeyboard();
		};
	});

	/**
	 * The phone keyboard goes over the tab bar, not under it.
	 *
	 * Capacitor's SystemBars plugin pads the window by the keyboard's height while it is open, so
	 * the WebView shrinks to the space above it, and the tab bar, pinned to the WebView's bottom,
	 * rode up on top of the keyboard. (`adjustPan` cannot help: that padding happens regardless.)
	 * Turning that handling off would also lose its status-bar insets on older WebViews, so instead
	 * the root is marked while the keyboard is open and the dock steps aside (app.css).
	 *
	 * Open means a text field has focus and the window is well short of its usual height. The usual
	 * height is learned whenever nothing is being typed into, so rotating the phone keeps up.
	 */
	function watchKeyboard() {
		const root = document.documentElement;
		let usual = window.innerHeight;
		const typing = () =>
			document.activeElement instanceof HTMLElement &&
			document.activeElement.matches('input:not([type="range"]):not([type="checkbox"]), textarea');
		const update = () => {
			if (!typing()) usual = window.innerHeight;
			const open = typing() && window.innerHeight < usual - 120;
			if (open) root.dataset.keyboard = 'open';
			else delete root.dataset.keyboard;
		};
		window.addEventListener('resize', update);
		document.addEventListener('focusin', update);
		document.addEventListener('focusout', update);
		return () => {
			window.removeEventListener('resize', update);
			document.removeEventListener('focusin', update);
			document.removeEventListener('focusout', update);
			delete root.dataset.keyboard;
		};
	}

	/**
	 * Coming back to the app asks the ring whether anything changed, once it has been a while.
	 * The ring on screen stays put meanwhile; `ring.load` does nothing inside its freshness
	 * window, so a quick switch away and back costs no request.
	 */
	function watchResume() {
		const onVisible = () => {
			if (document.visibilityState === 'visible' && ring.all.length) void ring.load();
		};
		document.addEventListener('visibilitychange', onVisible);
		const native = App.addListener('resume', onVisible).catch(() => null);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			void native.then((handle) => handle?.remove());
		};
	}

	/**
	 * A continuous-play ring session survives closing the app, unlike an ordinary Listen queue:
	 * it is the one queue a reader deliberately built up member by member, not a snapshot of
	 * whatever Feeds happened to be showing. Restoring never starts audio on its own; the mini
	 * player simply appears with the right track loaded, paused, same as a cold launch would
	 * refuse autoplay anyway.
	 */
	async function restoreRingQueue() {
		await store.init();
		const record = await store.getSetting<RingQueueRecord>('ringQueue');
		if (record) ringPlayer.restore(record);
		ringQueueRestored = true;
	}

	/** Once restoration finishes, save every change; null explicitly removes an obsolete session. */
	$effect(() => {
		const snapshot = ringPlayer.snapshot();
		if (ringQueueRestored) void store.setSetting('ringQueue', snapshot);
	});

	/**
	 * The dock grows to make room for the mini player, and every scroll area's bottom padding
	 * and the toast position read this one token rather than each knowing about the player.
	 * Minimized to its corner button it takes no room, so everything comes back down beside it.
	 */
	$effect(() => {
		document.documentElement.dataset.mini = String(player.sheet === 'mini' && !player.miniTucked);
		document.documentElement.dataset.miniTucked = String(
			player.sheet === 'mini' && player.miniTucked
		);
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
	<MiniPlayer />
	<TabBar />
	<Player />
</div>
