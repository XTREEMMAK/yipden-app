<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { partners } from '$lib/partnerRings.svelte.js';
	import { setTestingRing, TESTING_RINGS, testingRingOn } from '$lib/partner/registry.js';
	import Switch from './Switch.svelte';

	/**
	 * Settings' debug-build section: the age limit switch and the testing-only partner rings.
	 *
	 * Its own component, loaded with a dynamic import behind `__YIPDEN_DEBUG__`, so a release
	 * build (where that constant is the literal `false`) drops the import and never emits this
	 * code at all, rather than shipping it hidden. See vite.config.ts.
	 */

	let testingRings = $state<Record<string, boolean>>(
		Object.fromEntries(TESTING_RINGS.map((ring) => [ring.key, testingRingOn(ring.key)]))
	);

	function setTestingRingOn(key: string, on: boolean) {
		setTestingRing(key, on);
		testingRings = { ...testingRings, [key]: on };
		void partners.reload();
	}
</script>

<section class="grp" in:fly={flyIn({ delay: staggerDelay(2) })}>
	<h3 class="grp-h">Debug build</h3>
	<div class="rows">
		<div class="srow">
			<span class="tt">
				<b>Enforce the age limit</b>
				<small>Off keeps every post, so old saved feeds can be used for testing</small>
			</span>
			<Switch
				id="age-limit-enforced"
				label="Enforce the age limit"
				checked={prefs.ageLimitEnabled}
				onchange={(on) => prefs.setAgeLimitEnabled(on)}
			/>
		</div>
		{#each TESTING_RINGS as ring (ring.key)}
			<div class="srow">
				<span class="tt">
					<b>{ring.name} in Discover</b>
					<small>A partner ring read live; not approved by its maintainer yet</small>
				</span>
				<Switch
					id={`testing-ring-${ring.key}`}
					label={`Show ${ring.name} in Discover`}
					checked={testingRings[ring.key] ?? false}
					onchange={(on) => setTestingRingOn(ring.key, on)}
				/>
			</div>
		{/each}
	</div>
	<p class="note">Only in debug builds. A release build has none of these.</p>
</section>

<style>
	.grp {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.grp-h {
		margin: 0 4px;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		overflow: hidden;
	}

	.srow {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 64px;
		box-sizing: border-box;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--ink);
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
	}

	.tt {
		flex: 1;
		min-width: 0;
	}

	.srow b {
		display: block;
		font-size: 15px;
		font-weight: 600;
	}

	.srow small {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 12.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.note {
		margin: 8px 4px 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.4;
	}
</style>
