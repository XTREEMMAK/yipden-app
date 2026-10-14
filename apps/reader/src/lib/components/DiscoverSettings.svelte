<script lang="ts">
	import { onMount } from 'svelte';
	import Segmented from '$components/Segmented.svelte';
	import Switch from '$components/Switch.svelte';
	import { discoverSources } from '$lib/discoverSources.svelte.js';
	import { partners } from '$lib/partnerRings.svelte.js';
	import { partnerSources } from '$lib/partner/registry.js';
	import { ring } from '$lib/ring.svelte.js';
	import { startPage, type StartPage } from '$lib/startPage.svelte.js';
	import { toast } from '$lib/toast.svelte.js';

	/**
	 * Settings' start page and Discover's sources: which tab YipDen opens on, where Discover's
	 * people come from, and creator lists the reader adds (DECISIONS.md, 2026-10-14).
	 */

	let rings = $state<Array<{ id: string; name: string }>>([]);
	let listUrl = $state('');
	let listName = $state('');
	let adding = $state(false);
	let addError = $state<string | null>(null);

	onMount(() => {
		void startPage.load();
		void discoverSources.readSettings();
		void partnerSources().then((sources) => {
			rings = sources.map((source) => ({
				id: source.adapter.ring.id,
				name: source.adapter.ring.name
			}));
		});
	});

	async function setStart(value: StartPage) {
		await startPage.set(value);
		toast.show(
			value === 'yips'
				? 'YipDen will open on Yips next time.'
				: 'YipDen will open on Discover next time.'
		);
	}

	async function setSource(id: string, on: boolean) {
		await discoverSources.setOn(id, on);
		await ring.rebuild();
	}

	async function setRing(id: string, on: boolean) {
		await discoverSources.setOn(id, on);
		await partners.reload();
	}

	async function addList(event: SubmitEvent) {
		event.preventDefault();
		if (adding) return;
		adding = true;
		addError = null;
		try {
			const list = await discoverSources.addList(listUrl, listName);
			await ring.rebuild();
			listUrl = '';
			listName = '';
			toast.show(`Added ${list.name}. Its creators show up in Discover.`);
		} catch (cause) {
			addError = cause instanceof Error ? cause.message : 'That list could not be added.';
		} finally {
			adding = false;
		}
	}

	async function removeList(id: string, name: string) {
		await discoverSources.removeList(id);
		await ring.rebuild();
		toast.show(`Removed ${name}.`);
	}
</script>

<section class="grp">
	<h3 class="grp-h">Start on</h3>
	<div class="box">
		<Segmented
			label="Start on"
			options={[
				{ value: 'yips', label: 'Yips' },
				{ value: 'discover', label: 'Discover' }
			]}
			value={startPage.value}
			onchange={setStart}
		/>
		<p class="note">
			YipDen opens on Discover while you follow no one. A change applies the next time you open it.
		</p>
	</div>
</section>

<section class="grp">
	<h3 class="grp-h">Discover from</h3>
	<div class="rows">
		<div class="srow">
			<span class="tt">
				<b>IndieNodes</b>
				<small>Creators who joined the IndieNodes ring</small>
			</span>
			<Switch
				id="source-indienodes"
				label="IndieNodes"
				checked={discoverSources.isOn('indienodes')}
				onchange={(on) => setSource('indienodes', on)}
			/>
		</div>
		<div class="srow">
			<span class="tt">
				<b>YipDen's directory</b>
				<small>Creators YipDen lists by hand, who can ask to be removed</small>
			</span>
			<Switch
				id="source-yipden"
				label="YipDen's directory"
				checked={discoverSources.isOn('yipden')}
				onchange={(on) => setSource('yipden', on)}
			/>
		</div>
		{#each rings as entry (entry.id)}
			<div class="srow">
				<span class="tt">
					<b>{entry.name}</b>
					<small>A partner ring, in Discover's ring switcher</small>
				</span>
				<Switch
					id={`source-${entry.id}`}
					label={entry.name}
					checked={discoverSources.isOn(entry.id)}
					onchange={(on) => setRing(entry.id, on)}
				/>
			</div>
		{/each}
		{#each discoverSources.lists as list (list.id)}
			<div class="srow">
				<span class="tt">
					<b>{list.name}</b>
					<small>A creator list you added</small>
				</span>
				<Switch
					id={`source-list-${list.id}`}
					label={list.name}
					checked={discoverSources.isOn(`list:${list.id}`)}
					onchange={(on) => setSource(`list:${list.id}`, on)}
				/>
				<button
					class="remove"
					onclick={() => removeList(list.id, list.name)}
					aria-label={`Remove ${list.name}`}>Remove</button
				>
			</div>
		{/each}
	</div>
</section>

<section class="grp">
	<h3 class="grp-h">Add a creator list</h3>
	<form class="box add" onsubmit={addList} novalidate>
		<p class="note">
			A list of creators someone publishes, in YipDen's directory format or as a webring's
			ring.json. Its creators join Discover, labelled with the list's name.
		</p>
		<label for="list-url">Address</label>
		<input
			id="list-url"
			type="url"
			inputmode="url"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			placeholder="https://example.com/people.json"
			bind:value={listUrl}
		/>
		<label for="list-name">Name (optional)</label>
		<input id="list-name" type="text" maxlength="80" bind:value={listName} />
		{#if addError}<p class="err" role="alert">{addError}</p>{/if}
		<button class="add-btn" type="submit" disabled={adding || !listUrl.trim()}>
			{adding ? 'Checking…' : 'Add list'}
		</button>
	</form>
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

	.box,
	.rows {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.rows {
		gap: 0;
		padding: 0 14px;
	}

	.srow {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		border-bottom: 1px solid var(--line);
	}

	.srow:last-child {
		border-bottom: 0;
	}

	.tt {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.tt b {
		font-size: 15px;
		font-weight: 600;
	}

	.tt small,
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.4;
	}

	.remove,
	.add-btn {
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
	}

	.add-btn {
		align-self: flex-start;
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	.add-btn:disabled {
		opacity: 0.5;
	}

	label {
		font-size: 13px;
		font-weight: 600;
	}

	input {
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 15px;
	}

	.err {
		margin: 0;
		color: var(--error);
		font-size: 13px;
	}
</style>
