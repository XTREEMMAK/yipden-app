<script lang="ts">
	import type { RingFocalPoint } from '@yipden/ring-client';

	/**
	 * Debug builds only: places the current person's cover in the real hero, live, and gives the
	 * `thumb_position` to paste into the listing's own source (people.json for the directory; a
	 * ring member sets theirs in IndieNodes). Nothing here is stored: the source is the authority.
	 */
	let {
		point = $bindable(),
		name,
		onDone
	}: { point: RingFocalPoint; name: string; onDone: () => void } = $props();

	const line = $derived(`"thumb_position": { "x": ${point.x}, "y": ${point.y} }`);
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(line);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// No clipboard: the line is on screen to read off.
		}
	}
</script>

<div
	class="placement"
	role="group"
	aria-label={`Place ${name}’s cover`}
	data-noswipe
	onpointerdown={(e) => e.stopPropagation()}
	onpointerup={(e) => e.stopPropagation()}
>
	<label>
		<span>Left · right <output>{point.x}%</output></span>
		<input type="range" min="0" max="100" step="1" bind:value={point.x} />
	</label>
	<label>
		<span>Top · bottom <output>{point.y}%</output></span>
		<input type="range" min="0" max="100" step="1" bind:value={point.y} />
	</label>
	<code>{line}</code>
	<div class="row">
		<button type="button" onclick={() => (point = { x: 50, y: 50 })}>Centre</button>
		<button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
		<button type="button" class="done" onclick={onDone}>Done</button>
	</div>
</div>

<style>
	.placement {
		position: absolute;
		z-index: 30;
		top: calc(env(safe-area-inset-top) + 8px);
		left: 16px;
		right: 16px;
		display: grid;
		gap: 8px;
		padding: 12px 14px;
		border-radius: 16px;
		background: rgb(0 0 0 / 0.72);
		color: #fff;
		font-size: 0.875rem;
	}

	label {
		display: grid;
		gap: 2px;
	}

	label span {
		display: flex;
		justify-content: space-between;
	}

	input[type='range'] {
		width: 100%;
		min-height: 44px;
		margin: 0;
		accent-color: var(--brand, #f97316);
	}

	code {
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
	}

	.row {
		display: flex;
		gap: 8px;
	}

	button {
		flex: 1;
		min-height: 44px;
		border-radius: 999px;
		border: 1px solid rgb(255 255 255 / 0.4);
		background: transparent;
		color: #fff;
		font: inherit;
		font-weight: 600;
	}

	button.done {
		background: #fff;
		color: #000;
	}
</style>
