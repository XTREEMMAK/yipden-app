<script lang="ts">
	import { browserGuide } from '$lib/browserGuide.svelte.js';
	import Sheet from './Sheet.svelte';

	/**
	 * How finding on a creator's site works, step by step, and what keeping means: a link to their
	 * work, which stays theirs. See `browserGuide.svelte.ts` for when it shows.
	 */

	const STEPS = [
		{
			icon: 'M4 5h16v14H4zM4 9h16',
			title: 'Their site opens inside YipDen',
			text: 'Read and listen as you would anywhere. YipDen’s button sits in the bar at the top.'
		},
		{
			icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
			title: 'Play, hold or select',
			text: 'Play a track, hold a picture or comic page for a moment, or select a passage. The page says “picked” when it has it.'
		},
		{
			icon: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
			title: 'Tap YipDen’s button',
			text: 'Everything found on the page is listed: play a track to hear it first.'
		},
		{
			icon: 'M5 12.5l4.5 4.5L19 7.5',
			title: 'Keep what you love',
			text: 'It goes to your Library and to their profile, labelled as added by you.'
		}
	];
</script>

<Sheet
	title="Finding on a creator’s site"
	onclose={() => browserGuide.close()}
	historyKey="browserGuide"
	maxHeight="88vh"
	closeLabel="Got it"
	class="guide"
>
	<ol class="steps">
		{#each STEPS as step, index (step.title)}
			<li>
				<span class="ic" aria-hidden="true">
					<svg viewBox="0 0 24 24"><path d={step.icon} /></svg>
				</span>
				<span class="copy">
					<b>{index + 1}. {step.title}</b>
					<small>{step.text}</small>
				</span>
			</li>
		{/each}
	</ol>

	<div class="promise">
		<b>Links, not copies</b>
		<p>
			YipDen keeps only the link, on this phone. The work stays on the creator’s site: if they take
			it down, it goes from here too. Nothing is saved for good.
		</p>
		<b>Love their work? Support them</b>
		<p>Buy it, commission them or tip them on their own site. That is what keeps it there.</p>
	</div>

	<button class="got-it" onclick={() => browserGuide.close()}>Got it</button>
</Sheet>

<style>
	.steps {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin: 0;
		padding: 4px 12px;
		list-style: none;
	}

	li {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}

	.ic {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.ic svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.copy b {
		font-size: 15px;
	}

	.copy small {
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.4;
	}

	.promise {
		margin: 14px 12px 4px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface);
		font-size: 13.5px;
		line-height: 1.45;
	}

	.promise p {
		margin: 2px 0 10px;
		color: var(--muted);
	}

	.promise p:last-child {
		margin-bottom: 0;
	}

	.got-it {
		align-self: stretch;
		min-height: 48px;
		margin: 8px 12px 0;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font: inherit;
		font-weight: 650;
	}
</style>
