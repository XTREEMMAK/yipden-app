<script lang="ts">
	import { onMount } from 'svelte';
	import type { GameEntry, GameHost } from '@yipden/game-contracts';
	import { SessionController, type SessionSnapshot } from './session.js';

	let { games, host }: { games: readonly GameEntry[]; host: GameHost } = $props();
	const controller = new SessionController();
	let snapshot = $state<SessionSnapshot>({ state: 'idle', title: null, error: null });
	let stage: HTMLDivElement;
	let activeButton: HTMLButtonElement | null = null;

	onMount(() => {
		const unsubscribe = controller.subscribe((value) => {
			snapshot = value;
		});
		const pause = () => {
			if (document.hidden) void controller.pause();
		};
		const back = () => {
			void stop();
		};
		document.addEventListener('visibilitychange', pause);
		window.addEventListener('yipden-game-pause', pauseFromHost);
		window.addEventListener('yipden-game-exit', back);
		return () => {
			unsubscribe();
			document.removeEventListener('visibilitychange', pause);
			window.removeEventListener('yipden-game-pause', pauseFromHost);
			window.removeEventListener('yipden-game-exit', back);
			void controller.destroy();
		};
	});

	function pauseFromHost() {
		void controller.pause();
	}
	async function start(entry: GameEntry, event: MouseEvent) {
		activeButton = event.currentTarget as HTMLButtonElement;
		const target = document.createElement('div');
		stage.appendChild(target);
		await controller.start(entry, { target, host }, () => target.remove());
		if (snapshot.state === 'playing') stage.focus({ preventScroll: true });
	}
	async function stop() {
		await controller.stop();
		activeButton?.focus({ preventScroll: true });
	}
</script>

<section class="games-surface" aria-label="Games">
	{#if games.length}
		<div class="game-list">
			{#each games as entry (entry.id)}
				<article>
					<h2>{entry.title}</h2>
					<p>{entry.description}</p>
					<button
						onclick={(event) => void start(entry, event)}
						disabled={snapshot.state === 'loading'}>Play {entry.title}</button
					>
				</article>
			{/each}
		</div>
	{:else}
		<p>This build has no games installed.</p>
	{/if}
	<p class="status" role="status">{snapshot.title ? `${snapshot.title}: ` : ''}{snapshot.state}</p>
	{#if snapshot.error}<p role="alert">{snapshot.error}</p>{/if}
	{#if snapshot.state === 'loading' || snapshot.state === 'playing' || snapshot.state === 'paused'}
		<div class="session-controls">
			{#if snapshot.state === 'playing'}<button onclick={() => void controller.pause()}
					>Pause</button
				>{/if}
			{#if snapshot.state === 'paused'}<button onclick={() => void controller.resume()}
					>Resume</button
				>{/if}
			<button onclick={() => void stop()}
				>{snapshot.state === 'loading' ? 'Cancel loading' : 'Exit game'}</button
			>
		</div>
	{/if}
	<div class="stage" bind:this={stage} tabindex="-1" aria-label="Game surface"></div>
</section>

<style>
	.games-surface {
		color: inherit;
	}
	.game-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
		gap: 16px;
	}
	article {
		padding: 20px;
		border: 1px solid currentColor;
		border-radius: 12px;
	}
	h2 {
		margin-top: 0;
	}
	p {
		line-height: 1.6;
	}
	button {
		min-height: 44px;
		padding: 10px 16px;
		border: 1px solid currentColor;
		border-radius: 8px;
		color: inherit;
		background: transparent;
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		cursor: wait;
	}
	button:focus-visible,
	.stage:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 4px;
	}
	.session-controls {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.status {
		margin-block: 16px;
	}
	.stage:empty {
		display: none;
	}
</style>
