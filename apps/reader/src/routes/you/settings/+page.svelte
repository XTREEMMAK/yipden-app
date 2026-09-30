<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { MAX_MAX_AGE_DAYS, MIN_MAX_AGE_DAYS } from '$lib/age.js';
	import { theme, type Skin, type Theme } from '$lib/theme.svelte.js';
	import AboutSheet from '$components/AboutSheet.svelte';
	import Switch from '$components/Switch.svelte';
	import { you } from '$lib/you.svelte.js';
	import { shelf } from '$lib/shelf.svelte.js';
	import { downloadTextFile, pickTextFile } from '$lib/platform/download.js';
	import { createBackup, parseBackup, restoreBackup, type BackupPreview } from '$lib/backup.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';

	/**
	 * Settings: appearance, playback, and the reader's own data as files. Reached from You by the
	 * gear icon, never a tab of its own: this is configuration, not something a reader checks day
	 * to day the way Following or the Shelf is. See DECISIONS.md for the split.
	 */

	const THEMES: Array<{ key: Theme; label: string }> = [
		{ key: 'system', label: 'System' },
		{ key: 'light', label: 'Light' },
		{ key: 'dark', label: 'Dark' }
	];
	const SKINS: Array<{ key: Skin; label: string; description: string; colors: string[] }> = [
		{
			key: 'original',
			label: 'Original',
			description: 'Warm clay',
			colors: ['#f7f3ee', '#c2410c', '#2a0f06']
		},
		{
			key: 'glass',
			label: 'Blue glass',
			description: 'Cool & clear',
			colors: ['#ddecff', '#1677c8', '#061d38']
		},
		{
			key: 'forest',
			label: 'Forest earth',
			description: 'Moss & stone',
			colors: ['#f2f0e7', '#426b3a', '#162a1d']
		}
	];

	let segEls: HTMLButtonElement[] = [];
	let segIndicator = $state({ left: 0, width: 0 });
	let importing = $state(false);
	let backupPreview = $state<BackupPreview | null>(null);
	let backupBusy = $state(false);
	let aboutOpen = $state(false);
	let aboutButton = $state<HTMLButtonElement | undefined>(undefined);

	function measureSeg() {
		const index = THEMES.findIndex((entry) => entry.key === theme.current);
		const el = segEls[index];
		if (el) segIndicator = { left: el.offsetLeft, width: el.offsetWidth };
	}

	$effect(() => {
		void theme.current;
		measureSeg();
	});

	onMount(() => {
		// Reached only from You, which already loads both; defensive in case that ever changes.
		void you.load();
		void shelf.load();
		measureSeg();
		const onResize = () => measureSeg();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function exportFollows() {
		if (!you.rows.length && !shelf.items.length) return;
		downloadTextFile('yipden-follows.opml', you.toOpml());
		toast.show('Saved yipden-follows.opml.');
	}

	async function importFollows() {
		importing = true;
		try {
			const text = await pickTextFile('.opml,.xml,text/xml,text/x-opml');
			if (!text) return;
			const { people, feeds, saved } = await you.importOpml(text);
			const shelved = saved ? `${saved} saved ${saved === 1 ? 'link' : 'links'}` : '';
			toast.show(
				people === 0 && !saved
					? 'Nothing new to import from that file.'
					: people === 0
						? `Added ${shelved} to your Shelf.`
						: `Imported ${people} ${people === 1 ? 'person' : 'people'}, ${feeds} ${feeds === 1 ? 'feed' : 'feeds'}${shelved ? `, ${shelved}` : ''}.`
			);
		} catch {
			toast.show('Could not read that file as OPML.');
		} finally {
			importing = false;
		}
	}

	async function exportYipDenBackup() {
		backupBusy = true;
		try {
			const backup = await createBackup();
			downloadTextFile('yipden-backup.json', JSON.stringify(backup, null, 2));
			toast.show('Saved yipden-backup.json.');
		} catch {
			toast.show('Could not build a backup on this phone.');
		} finally {
			backupBusy = false;
		}
	}

	async function chooseYipDenBackup() {
		backupBusy = true;
		backupPreview = null;
		try {
			const text = await pickTextFile('.json,application/json');
			if (!text) return;
			backupPreview = parseBackup(text);
		} catch (cause) {
			toast.show(cause instanceof Error ? cause.message : 'Could not read that backup.');
		} finally {
			backupBusy = false;
		}
	}

	async function importYipDenBackup() {
		if (!backupPreview) return;
		backupBusy = true;
		try {
			// `$state` wraps the preview in proxies; detach and revalidate before IndexedDB cloning.
			const selectedBackup = parseBackup(JSON.stringify(backupPreview.backup)).backup;
			const report = await restoreBackup(selectedBackup);
			await you.load();
			await shelf.load();
			backupPreview = null;
			theme.hydrate();
			const skipped = report.peopleSkipped + report.feedsSkipped;
			toast.show(
				`Restored ${report.peopleAdded} people, ${report.feedsAdded} sources, ${report.yipsAdded} cached yips${report.shelfAdded ? `, and ${report.shelfAdded} Shelf links` : ''}${skipped ? `; skipped ${skipped} conflicts` : ''}.`
			);
		} catch (cause) {
			toast.show(
				cause instanceof Error
					? `Could not restore that backup: ${cause.message}`
					: 'Could not restore that backup. Nothing unsafe was imported.'
			);
		} finally {
			backupBusy = false;
		}
	}

	function openAbout() {
		aboutOpen = true;
	}

	async function closeAbout() {
		aboutOpen = false;
		await tick();
		aboutButton?.focus();
	}

	async function clearCachedYips() {
		await you.clearCachedYips();
		toast.show('Cleared cached yips. Your follows stay put.');
	}
</script>

<svelte:head><title>Settings</title></svelte:head>

<div class="scroll" inert={aboutOpen} aria-hidden={aboutOpen}>
	<header class="head" in:fly={flyIn()}>
		<button class="back" onclick={() => goto('/you')} aria-label="Back to You">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
		</button>
		<h2 class="screen-title">Settings</h2>
	</header>

	<div class="groups">
		<section class="grp" in:fly={flyIn({ delay: staggerDelay(0) })}>
			<h3 class="grp-h">Appearance</h3>
			<div class="appearance-stack">
				<div class="appearance-setting">
					<p class="setting-label">Brightness</p>
					<div class="seg" role="radiogroup" aria-label="Brightness">
						<span
							class="seg-ind"
							aria-hidden="true"
							style:transform={`translateX(${segIndicator.left}px)`}
							style:width={`${segIndicator.width}px`}
						></span>
						{#each THEMES as entry, index (entry.key)}
							<button
								bind:this={segEls[index]}
								role="radio"
								aria-checked={theme.current === entry.key}
								onclick={() => theme.set(entry.key)}
							>
								{entry.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="appearance-setting">
					<p class="setting-label">Color skin</p>
					<div class="skin-grid" role="radiogroup" aria-label="Color skin">
						{#each SKINS as entry (entry.key)}
							<button
								class="skin-option"
								role="radio"
								aria-label={entry.label}
								aria-checked={theme.skin === entry.key}
								onclick={() => theme.setSkin(entry.key)}
							>
								<span class="skin-swatches" aria-hidden="true">
									{#each entry.colors as color}
										<i style:background={color}></i>
									{/each}
								</span>
								<strong>{entry.label}</strong>
								<small>{entry.description}</small>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(1) })}>
			<h3 class="grp-h">Playback</h3>
			<div class="rows">
				<div class="srow">
					<span class="tt">
						<b>Shuffle music</b>
						<small>Mix up a member{"'"}s tracks</small>
					</span>
					<Switch
						id="shuffle-music"
						label="Shuffle music"
						checked={prefs.shuffleMusic}
						onchange={(on) => prefs.setShuffleMusic(on)}
					/>
				</div>
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(2) })}>
			<h3 class="grp-h">Feeds</h3>
			<div class="rows">
				<div class="srow">
					<span class="tt">
						<b>Mark as read when scrolled past</b>
						<small>A card counts as read once it leaves the top of the screen</small>
					</span>
					<Switch
						id="mark-read-on-scroll"
						label="Mark as read when scrolled past"
						checked={prefs.markReadOnScroll}
						onchange={(on) => prefs.setMarkReadOnScroll(on)}
					/>
				</div>
				<div class="srow slider-row">
					<span class="tt">
						<b>Keep posts from the last {prefs.maxAgeDays} days</b>
						<small>Older posts are not saved. Each follow can override this.</small>
					</span>
					<input
						class="age-slider"
						type="range"
						min={MIN_MAX_AGE_DAYS}
						max={MAX_MAX_AGE_DAYS}
						step="1"
						value={prefs.maxAgeDays}
						aria-label="Days of posts to keep"
						oninput={(event) => (prefs.maxAgeDays = Number(event.currentTarget.value))}
						onchange={(event) => prefs.setMaxAgeDays(Number(event.currentTarget.value))}
					/>
				</div>
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(3) })}>
			<h3 class="grp-h">Your follows file</h3>
			<div class="rows">
				<button
					class="srow link"
					onclick={exportFollows}
					disabled={!you.rows.length && !shelf.items.length}
				>
					<span class="tt">
						<b>Export as OPML</b>
						<small>Your follows, and your Shelf, for any other reader</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
				</button>
				<button class="srow link" onclick={importFollows} disabled={importing}>
					<span class="tt">
						<b>{importing ? 'Importing…' : 'Import OPML'}</b>
						<small>Bring follows in from another reader</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				</button>
				<button class="srow link" onclick={clearCachedYips}>
					<span class="tt">
						<b>Clear cached yips</b>
						<small>Your follows stay put</small>
					</span>
				</button>
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(3) })}>
			<h3 class="grp-h">YipDen backup</h3>
			<div class="rows">
				<button class="srow link" onclick={exportYipDenBackup} disabled={backupBusy}>
					<span class="tt">
						<b>Export full backup</b>
						<small>Follows, Shelf, sources, preferences, read state, and cached yips</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
				</button>
				<button class="srow link" onclick={chooseYipDenBackup} disabled={backupBusy}>
					<span class="tt">
						<b>Preview backup import</b>
						<small>Nothing changes until you confirm</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				</button>
				{#if backupPreview}
					<div class="backup-preview" aria-live="polite">
						<span class="tt">
							<b>Ready to restore</b>
							<small>
								{backupPreview.people} people · {backupPreview.feeds} sources · {backupPreview.yips}
								cached yips{backupPreview.shelf ? ` · ${backupPreview.shelf} Shelf links` : ''}.
								Existing data is kept; source conflicts are skipped.
							</small>
						</span>
						<span class="backup-actions">
							<button class="mini-btn" onclick={() => (backupPreview = null)}>Cancel</button>
							<button class="mini-btn restore" onclick={importYipDenBackup} disabled={backupBusy}>
								{backupBusy ? 'Restoring…' : 'Restore'}
							</button>
						</span>
					</div>
				{/if}
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(4) })}>
			<h3 class="grp-h">About</h3>
			<div class="rows">
				<button
					bind:this={aboutButton}
					class="srow link"
					type="button"
					aria-haspopup="dialog"
					onclick={openAbout}
				>
					<span class="tt">
						<b>About YipDen</b>
						<small>Version, privacy, history, source, and attributions</small>
					</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
				</button>
			</div>
		</section>

		<p class="fine" in:fly={flyIn({ delay: staggerDelay(5) })}>
			Chronological, no AI, and every yip links out to its creator.
		</p>
	</div>

	<Toast />
</div>
{#if aboutOpen}
	<AboutSheet onclose={closeAbout} />
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: calc(26px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.back {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.back svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.screen-title {
		margin: 0;
		font-family: var(--display);
		font-size: 26px;
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 4px 16px 0;
	}

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

	.appearance-stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.appearance-setting {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.setting-label {
		margin: 0 2px;
		color: var(--muted);
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.seg {
		position: relative;
		display: flex;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.seg-ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 999px;
		background: var(--brand);
		transition:
			transform var(--dur-m) var(--ease),
			width var(--dur-m) var(--ease);
	}

	.seg button {
		position: relative;
		z-index: 1;
		flex: 1;
		/* 44px, not the prototype's 42px: the brief's touch target floor. See DECISIONS.md. */
		height: 44px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font-family: var(--body);
		font-size: 14px;
		font-weight: 550;
		transition: color var(--dur-s) var(--ease);
	}

	.seg button[aria-checked='true'] {
		color: #fff;
	}

	.skin-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.skin-option {
		display: flex;
		min-width: 0;
		min-height: 92px;
		padding: 9px;
		border: 1px solid var(--line);
		border-radius: 15px;
		background: color-mix(in srgb, var(--surface) 78%, var(--ground));
		color: var(--ink);
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		transition:
			border-color var(--dur-s) var(--ease),
			background var(--dur-s) var(--ease),
			transform var(--dur-s) var(--ease);
	}

	.skin-option:active {
		transform: scale(0.97);
	}

	.skin-option[aria-checked='true'] {
		border-color: var(--brand);
		background: var(--brand-soft);
		box-shadow: inset 0 0 0 1px var(--brand);
	}

	.skin-swatches {
		display: flex;
		width: 100%;
		height: 22px;
		margin-bottom: 8px;
		border-radius: 7px;
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
	}

	.skin-swatches i {
		flex: 1;
	}

	.skin-option strong {
		display: block;
		font-size: 12.5px;
		line-height: 1.15;
		font-weight: 650;
	}

	.skin-option small {
		display: block;
		margin-top: 3px;
		color: var(--muted);
		font-size: 10.5px;
		line-height: 1.15;
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
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		text-align: left;
		font: inherit;
		overflow: hidden;
	}

	.srow:last-child {
		border-bottom: 0;
	}

	.srow:disabled {
		opacity: 0.5;
	}

	.srow.slider-row {
		flex-wrap: wrap;
	}

	.age-slider {
		flex: 1 1 100%;
		accent-color: var(--brand);
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

	.srow.link svg {
		flex: 0 0 auto;
		width: 16px;
		height: 16px;
		color: var(--muted);
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.mini-btn {
		flex: 0 0 auto;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: inherit;
		font-family: var(--body);
		font-size: 13px;
		font-weight: 600;
	}

	.backup-preview {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		background: var(--brand-soft);
	}

	.backup-preview b,
	.backup-preview small {
		display: block;
	}

	.backup-preview b {
		font-size: 14px;
	}

	.backup-preview small {
		margin-top: 3px;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.backup-actions {
		display: flex;
		gap: 6px;
		flex: 0 0 auto;
	}

	.mini-btn.restore {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	@media (max-width: 520px) {
		.backup-preview {
			align-items: stretch;
			flex-direction: column;
		}

		.backup-actions {
			justify-content: flex-end;
		}
	}

	.fine {
		margin: 0;
		padding: 0 6px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
</style>
