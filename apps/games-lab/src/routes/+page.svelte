<script lang="ts">
	import { onMount } from 'svelte';
	import { App } from '@capacitor/app';
	import { GameSurface } from '@yipden/game-host';
	import type { GameHost, GameId, JsonValue } from '@yipden/game-contracts';
	import { games, profile } from 'virtual:yipden-games';
	import { references } from 'virtual:yipden-game-references';

	let reference = $state<GameId | null>(null);
	let referenceButton: HTMLButtonElement | null = null;
	const saves = new Map<GameId, JsonValue>();
	const host: GameHost = {
		surface: 'lab',
		beforeStart: closeReference,
		page: { id: 'lab-fixture', mode: 'fixture' },
		saves: {
			read: async (id) => saves.get(id) ?? null,
			write: async (id, value) => {
				saves.set(id, structuredClone(value));
			}
		},
		requestExit: () => window.dispatchEvent(new Event('yipden-game-exit'))
	};
	const commit = __LAB_COMMIT__,
		build = __LAB_BUILD__;

	function closeReference() {
		reference = null;
		referenceButton?.focus({ preventScroll: true });
	}
	function pause() {
		window.dispatchEvent(new Event('yipden-game-pause'));
		// References have no shared lifecycle contract. Remove their browsing context to stop all work.
		closeReference();
	}
	onMount(() => {
		const visibility = () => {
			if (document.hidden) pause();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeReference();
				host.requestExit();
			}
		};
		document.addEventListener('visibilitychange', visibility);
		document.addEventListener('keydown', key);
		const state = App.addListener('appStateChange', (event) => {
			if (!event.isActive) pause();
		}).catch(() => null);
		const back = App.addListener('backButton', () => {
			closeReference();
			host.requestExit();
		}).catch(() => null);
		return () => {
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('keydown', key);
			void state.then((handle) => handle?.remove());
			void back.then((handle) => handle?.remove());
		};
	});
</script>

<svelte:head><title>YipDen Games Lab</title></svelte:head>
<main>
	<header>
		<p class="eyebrow">YipDen · development</p>
		<h1>Games Lab</h1>
		<p>Try the player scaffolds and supplied reference prototypes. Realm is our first focus.</p>
	</header>
	<p class="build">Profile: {profile} · {commit} · build {build}</p>
	<GameSurface {games} {host} />
	{#if Object.keys(references).length}
		<section aria-label="Reference prototypes" class="references">
			<h2>Reference prototypes</h2>
			<p>
				These are the supplied experiments. Closing or backgrounding a reference ends its current
				run.
			</p>
			<div class="buttons">
				{#each games.filter((game) => references[game.id]) as game (game.id)}
					<button
						onclick={(event) => {
							host.requestExit();
							referenceButton = event.currentTarget;
							reference = game.id;
						}}>Open {game.title} prototype</button
					>
				{/each}
			</div>
			{#if reference && references[reference]}
				<div class="reference-heading">
					<h3>{reference === 'realm' ? 'Realm' : 'The Stray'} prototype</h3>
					<button onclick={closeReference}>Close prototype</button>
				</div>
				<iframe
					src={references[reference]}
					title={`${reference === 'realm' ? 'Realm' : 'The Stray'} reference prototype`}
					sandbox="allow-scripts allow-same-origin allow-downloads"
					referrerpolicy="no-referrer"
				></iframe>
			{/if}
		</section>
	{/if}
	<footer>
		<p>Development surface. Saves are disposable. Reader data lives in the separate reader app.</p>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f6f0e7;
		color: #281a12;
		font-family: system-ui, sans-serif;
	}
	:global(*) {
		box-sizing: border-box;
	}
	main {
		max-width: 1100px;
		margin: auto;
		padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
			max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
	}
	header {
		margin-bottom: 24px;
	}
	h1 {
		font-size: clamp(32px, 5vw, 48px);
		margin-block: 8px;
	}
	p {
		line-height: 1.6;
	}
	.eyebrow,
	.build,
	footer {
		font-size: 14px;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.references {
		margin-top: 32px;
		padding-top: 16px;
		border-top: 1px solid currentColor;
	}
	.buttons,
	.reference-heading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.reference-heading {
		justify-content: space-between;
	}
	button {
		min-height: 44px;
		padding: 10px 16px;
		border: 1px solid currentColor;
		border-radius: 8px;
		font: inherit;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 4px;
	}
	iframe {
		display: block;
		width: 100%;
		height: 80dvh;
		min-height: 500px;
		border: 1px solid currentColor;
		border-radius: 12px;
		background: #15110f;
	}
	footer {
		margin-top: 32px;
	}
	@media (prefers-color-scheme: dark) {
		:global(body) {
			color: #f8efdf;
			background: #1c1510;
		}
	}
</style>
