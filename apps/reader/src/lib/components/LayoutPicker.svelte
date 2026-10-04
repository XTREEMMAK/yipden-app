<script lang="ts">
	import type { SiteLayout } from '@yipden/ring-client';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';

	/**
	 * Whether a creator's site reads best on a phone or a bigger screen, the reader's own call
	 * over whatever the ring declared or the page suggested. "As found" goes back to that.
	 */

	interface Props {
		id: string;
		creatorUrl: string;
		declared: SiteLayout | undefined;
	}

	let { id, creatorUrl, declared }: Props = $props();

	const AS_FOUND = 'as-found';
	let value = $derived(
		creatorNotes.hasLayoutOverride(creatorUrl)
			? (creatorNotes.layoutFor(creatorUrl, declared) ?? AS_FOUND)
			: AS_FOUND
	);
	let foundLabel = $derived(
		declared === 'desktop-first' ? 'As found: a bigger screen' : 'As found: a phone'
	);

	function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
		const picked = event.currentTarget.value;
		void creatorNotes.setLayout(creatorUrl, picked === AS_FOUND ? null : (picked as SiteLayout));
	}
</script>

<div class="layout">
	<label for={id}>Reads best on</label>
	<select {id} {value} onchange={onChange}>
		<option value={AS_FOUND}>{foundLabel}</option>
		<option value="mobile-friendly">A phone</option>
		<option value="desktop-first">A bigger screen</option>
	</select>
</div>

<style>
	.layout {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		font-size: 12.5px;
	}

	select {
		flex: 1;
		box-sizing: border-box;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 14px;
	}
</style>
