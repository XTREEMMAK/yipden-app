<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { onMount } from 'svelte';
	import { safeUrl } from '@yipden/ring-client';
	import { creatorNotes } from '$lib/creatorNotes.svelte.js';
	import { placeLabel } from '$lib/creatorProfile.svelte.js';
	import { creators } from '$lib/creators.svelte.js';
	import { store, type Person } from '$lib/store/index.js';
	import { verdictKey, verdicts } from '$lib/verdicts.svelte.js';

	/**
	 * "Same person as…": link another address to this creator. Paste one (their Bluesky, their
	 * Instagram, a second site), or pick a creator YipDen already knows from your follows, Liked and
	 * Not Liked, and the Library. Linking is the reader's own say-so, kept on this phone, and can be
	 * undone from the profile.
	 */

	interface Props {
		/** The creator being linked to: any of their addresses. */
		url: string;
		name: string;
		onclose: () => void;
	}

	let { url, name, onclose }: Props = $props();

	let pasted = $state('');
	let query = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let people = $state<Person[]>([]);

	onMount(() => {
		void store.listPeople().then((list) => (people = list));
		void creatorNotes.load();
		if (!verdicts.loaded) void verdicts.load();
	});

	/** Everyone YipDen knows by name, once each, not already this creator. */
	let known = $derived.by(() => {
		const self = creators.idFor(url);
		const seen = new Set<string>();
		const out: Array<{ url: string; name: string; from: string }> = [];
		const add = (address: string, label: string, from: string) => {
			const id = creators.idFor(address);
			if (id === self || seen.has(id)) return;
			seen.add(id);
			out.push({ url: address, name: label, from });
		};
		for (const person of people) add(person.siteUrl, person.name, 'You follow them');
		for (const item of verdicts.items) {
			add(item.url, item.name, item.verdict === 'liked' ? 'Liked' : 'Not Liked');
		}
		for (const reference of creatorNotes.references) {
			add(
				`https://${reference.creatorId}`,
				reference.creatorName ?? reference.creatorId,
				'In your Library'
			);
		}
		return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	});

	let shown = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return needle
			? known.filter(
					(entry) =>
						entry.name.toLowerCase().includes(needle) || verdictKey(entry.url).includes(needle)
				)
			: known;
	});

	async function link(address: string) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const linked = await creators.merge(url, address);
			if (!linked) {
				error = 'That address is already theirs.';
				return;
			}
			onclose();
		} finally {
			busy = false;
		}
	}

	async function linkPasted(event: SubmitEvent) {
		event.preventDefault();
		const raw = pasted.trim();
		const address = safeUrl(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`)?.toString();
		if (!address) {
			error = 'Paste a public https address: a profile, a shop or another site of theirs.';
			return;
		}
		await link(address);
	}

	let preview = $derived.by(() => {
		const raw = pasted.trim();
		const address = raw ? safeUrl(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`) : null;
		return address ? placeLabel(address.toString()).label : null;
	});
</script>

<Sheet
	title={`Same person as ${name}`}
	{onclose}
	historyKey="samePerson"
	maxHeight="80vh"
	class="same-sheet"
>
	<form class="paste" onsubmit={linkPasted} novalidate>
		<label for="same-address">Another address of theirs</label>
		<div class="field">
			<input
				id="same-address"
				type="text"
				inputmode="url"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="bsky.app/profile/… or their shop"
				bind:value={pasted}
				aria-describedby={error ? 'same-error' : undefined}
			/>
			<button class="link-btn" type="submit" disabled={busy || !pasted.trim()}>Link</button>
		</div>
		{#if preview}<small class="hint">{preview}</small>{/if}
		{#if error}<p class="err" id="same-error">{error}</p>{/if}
	</form>

	{#if known.length}
		<h3 class="sheet-sec">Or someone YipDen already knows</h3>
		{#if known.length > 8}
			<input
				class="sheet-search"
				type="search"
				placeholder="Find by name"
				aria-label="Find by name"
				bind:value={query}
			/>
		{/if}
		<div class="list">
			{#each shown as entry (entry.url)}
				<button class="sheet-row" disabled={busy} onclick={() => link(entry.url)}>
					<span class="row-text">
						<b>{entry.name}</b>
						<small>{verdictKey(entry.url)} · {entry.from}</small>
					</span>
				</button>
			{:else}
				<p class="note">Nobody by that name.</p>
			{/each}
		</div>
	{/if}
	<p class="note">
		Only on this phone, as you said it. Unlink an address from their profile at any time.
	</p>
</Sheet>

<style>
	.paste {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 12px;
	}

	.paste label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.field {
		display: flex;
		gap: 8px;
	}

	.field input,
	.sheet-search {
		box-sizing: border-box;
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 15px;
	}

	.sheet-search {
		margin: 0 12px;
		flex: none;
	}

	.link-btn {
		flex: none;
		min-width: 72px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font: inherit;
		font-weight: 650;
	}

	.link-btn:disabled {
		opacity: 0.5;
	}

	.hint {
		color: var(--brand-text);
		font-size: 12px;
		font-weight: 600;
	}

	.err {
		margin: 0;
		color: var(--error);
		font-size: 13px;
	}

	.sheet-sec {
		margin: 10px 12px 0;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.list {
		display: flex;
		flex-direction: column;
	}

	.sheet-row {
		display: flex;
		align-items: center;
		min-height: 52px;
		padding: 6px 16px;
		border: 0;
		border-radius: 12px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.row-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.row-text b {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.row-text small {
		color: var(--muted);
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.note {
		margin: 6px 16px 0;
		color: var(--muted);
		font-size: 13px;
	}
</style>
