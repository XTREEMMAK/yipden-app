<script lang="ts">
	import { MAX_FOLDER_LENGTH, type FolderSummary } from '$lib/folders.js';

	/**
	 * One person's folder: none, one already in use, or a new one typed here. A folder is only a
	 * name on a person (see `folders.ts`), so naming a new one is all it takes to make it.
	 */

	interface Props {
		id: string;
		value: string | undefined;
		folders: FolderSummary[];
		onchange: (folder: string | null) => void;
	}

	let { id, value, folders, onchange }: Props = $props();

	const NONE = '\u0000none';
	const NEW = '\u0000new';

	let naming = $state(false);
	let draft = $state('');

	function onSelect(event: Event & { currentTarget: HTMLSelectElement }) {
		const picked = event.currentTarget.value;
		if (picked === NEW) {
			naming = true;
			draft = '';
			return;
		}
		naming = false;
		onchange(picked === NONE ? null : picked);
	}

	function saveNew(event: SubmitEvent) {
		event.preventDefault();
		if (!draft.trim()) return;
		onchange(draft);
		naming = false;
	}
</script>

<div class="folder">
	<label for={id}>Folder</label>
	<select {id} value={naming ? NEW : (value ?? NONE)} onchange={onSelect}>
		<option value={NONE}>No folder</option>
		{#each folders as folder (folder.name)}
			<option value={folder.name}>{folder.name}</option>
		{/each}
		<option value={NEW}>New folder{'…'}</option>
	</select>
	{#if naming}
		<form class="new" onsubmit={saveNew}>
			<input
				type="text"
				aria-label="New folder name"
				placeholder="Folder name"
				maxlength={MAX_FOLDER_LENGTH}
				bind:value={draft}
			/>
			<button type="submit" disabled={!draft.trim()}>Save</button>
			<button type="button" onclick={() => (naming = false)}>Cancel</button>
		</form>
	{/if}
</div>

<style>
	.folder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		width: 100%;
		font-size: 12.5px;
	}

	select,
	input {
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

	select {
		flex: 1;
	}

	.new {
		display: flex;
		flex: 1 1 100%;
		gap: 8px;
	}

	.new input {
		flex: 1;
	}

	.new button {
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}

	.new button:disabled {
		opacity: 0.55;
	}
</style>
