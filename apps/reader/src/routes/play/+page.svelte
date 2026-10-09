<script lang="ts">
	import { onMount } from 'svelte';
	import { App } from '@capacitor/app';
	import { GameSurface } from '@yipden/game-host';
	import type { GameHost } from '@yipden/game-contracts';
	import { player } from '$lib/player.svelte.js';
	import { hear } from '$lib/hear.svelte.js';
	import { games } from 'virtual:yipden-games';

	const host: GameHost = {
		surface: 'reader',
		beforeStart: () => {
			player.pause();
			hear.stop();
		},
		page: null,
		// No game writes are enabled until the Store/save/backup contract is settled.
		saves: {
			read: async () => null,
			write: async () => {
				throw new Error('Game saves are not enabled in this scaffold.');
			}
		},
		requestExit: () => window.dispatchEvent(new Event('yipden-game-exit'))
	};
	onMount(() => {
		const handle = App.addListener('appStateChange', (event) => {
			if (!event.isActive) window.dispatchEvent(new Event('yipden-game-pause'));
		}).catch(() => null);
		return () => {
			void handle.then((value) => value?.remove());
		};
	});
</script>

<svelte:head><title>Play · YipDen</title></svelte:head>
<div class="play-page">
	<a href="/you/" data-sveltekit-preload-data="false" data-sveltekit-preload-code="false"
		>Back to You</a
	>
	<h1>Play</h1>
	<GameSurface {games} {host} />
</div>

<style>
	.play-page {
		padding: 24px 20px calc(24px + var(--dock-height, 80px));
		overflow-y: auto;
		height: 100%;
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	h1 {
		margin-block: 16px 24px;
	}
</style>
