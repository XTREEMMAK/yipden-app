<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { DiscoveredFeed } from '@yipden/feeds';
	import { fly } from 'svelte/transition';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { prefs } from '$lib/prefs.svelte.js';
	import { theme, type Skin, type Theme } from '$lib/theme.svelte.js';
	import AboutSheet from '$components/AboutSheet.svelte';
	import Switch from '$components/Switch.svelte';
	import { you } from '$lib/you.svelte.js';
	import { downloadTextFile, pickTextFile } from '$lib/platform/download.js';
	import { createBackup, parseBackup, restoreBackup, type BackupPreview } from '$lib/backup.js';
	import { toast } from '$lib/toast.svelte.js';
	import Toast from '$components/Toast.svelte';

	/**
	 * You: appearance, the follow list, and the reader's own data. Everything here is either
	 * read from or written straight to the device; there is no account in v0.9.
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
	let confirmingId = $state<string | null>(null);
	let importing = $state(false);
	let backupPreview = $state<BackupPreview | null>(null);
	let backupBusy = $state(false);
	let expandedIds = $state<Set<string>>(new Set());
	let busyFeedIds = $state<Set<string>>(new Set());
	let busyPersonIds = $state<Set<string>>(new Set());
	let addingForId = $state<string | null>(null);
	let sourceInput = $state('');
	let sourceMatches = $state<DiscoveredFeed[]>([]);
	let sourceError = $state<string | null>(null);
	let sourceBusy = $state(false);
	let busySourceUrl = $state<string | null>(null);
	let aboutOpen = $state(false);
	let aboutButton = $state<HTMLButtonElement | undefined>(undefined);
	let confirmingSourceId = $state<string | null>(null);

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
		void you.load();
		measureSeg();
		const onResize = () => measureSeg();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	async function confirmUnfollow(personId: string, name: string) {
		confirmingId = null;
		await you.unfollow(personId);
		toast.show(`Unfollowed ${name}. Their yips are gone from Feeds.`);
	}

	function toggleExpanded(personId: string) {
		const next = new Set(expandedIds);
		if (next.has(personId)) next.delete(personId);
		else next.add(personId);
		expandedIds = next;
	}

	function feedKindLabel(kind: string): string {
		return (
			{
				blog: 'Website',
				bluesky: 'Bluesky',
				mastodon: 'Mastodon',
				youtube: 'YouTube',
				peertube: 'PeerTube',
				podcast: 'Podcast',
				forum: 'Forum',
				rss: 'RSS',
				atom: 'Atom',
				json: 'JSON Feed',
				jsonfeed: 'JSON Feed'
			}[kind] ?? kind
		);
	}

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch (cause) {
			return url;
		}
	}

	function asUrl(raw: string): string | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
		try {
			return new URL(withScheme).toString();
		} catch {
			return null;
		}
	}

	function sourceStatus(feed: (typeof you.rows)[number]['feeds'][number]): string {
		if (!feed.enabled) return 'Paused · cached yips hidden';
		if (feed.failures >= 5) return 'Needs attention · automatic checks stopped';
		if (feed.failures > 0) {
			return `Last check failed · ${feed.failures} ${feed.failures === 1 ? 'failure' : 'failures'} in a row`;
		}
		if (feed.lastFetchedAt) {
			return `Checked ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(feed.lastFetchedAt))}`;
		}
		return 'Not checked yet';
	}

	function beginAddSource(personId: string) {
		addingForId = addingForId === personId ? null : personId;
		sourceInput = '';
		sourceMatches = [];
		sourceError = null;
	}

	async function findSources(event: SubmitEvent) {
		event.preventDefault();
		const url = asUrl(sourceInput);
		if (!url) {
			sourceError = 'Paste a feed, website, or profile link first.';
			return;
		}
		sourceBusy = true;
		sourceError = null;
		sourceMatches = [];
		try {
			const found = await you.findSources(url);
			sourceMatches = found.feeds;
			if (!found.feeds.length) {
				sourceError =
					'No readable feed was found there. Try the direct RSS, Atom, or JSON Feed address.';
			}
		} catch {
			sourceError = `Could not read ${hostOf(url)}. Check the address, or try again when you are online.`;
		} finally {
			sourceBusy = false;
		}
	}

	async function attachSource(personId: string, source: DiscoveredFeed) {
		busySourceUrl = source.url;
		try {
			const result = await you.addSource(personId, source);
			if (result.status === 'added') {
				toast.show(
					result.refresh === 'failed' || result.refresh === 'missing'
						? `${feedKindLabel(source.kind)} was added, but its first check failed.`
						: `${feedKindLabel(source.kind)} was added and checked.`
				);
				addingForId = null;
				sourceMatches = [];
				sourceInput = '';
			} else if (result.status === 'already-attached') {
				toast.show('That source is already attached to this creator.');
			} else if (result.status === 'belongs-to-other') {
				toast.show(`That source is already attached to ${result.personName}.`);
			} else {
				toast.show('That creator is no longer in your follows.');
			}
		} catch {
			toast.show('Could not save that source.');
		} finally {
			busySourceUrl = null;
		}
	}

	async function retrySource(personId: string, feedId: string, label: string) {
		busyFeedIds = new Set(busyFeedIds).add(feedId);
		try {
			const status = await you.retryFeed(personId, feedId);
			toast.show(
				status === 'failed' || status === 'missing'
					? `${label} still could not be reached.`
					: `${label} is healthy again.`
			);
		} catch {
			toast.show(`Could not check ${label}.`);
		} finally {
			const next = new Set(busyFeedIds);
			next.delete(feedId);
			busyFeedIds = next;
		}
	}

	async function removeManualSource(personId: string, feedId: string, label: string) {
		confirmingSourceId = null;
		if (await you.removeManualSource(personId, feedId)) {
			toast.show(`Removed ${label} and its cached yips.`);
		} else {
			toast.show(`Could not remove ${label}.`);
		}
	}

	async function setCreatorSources(personId: string, name: string, enabled: boolean) {
		busyPersonIds = new Set(busyPersonIds).add(personId);
		try {
			const changed = await you.setPersonEnabled(personId, enabled);
			toast.show(
				changed === 0
					? `${name}'s sources were already ${enabled ? 'active' : 'paused'}.`
					: `${enabled ? 'Enabled' : 'Paused'} ${changed} ${changed === 1 ? 'source' : 'sources'} for ${name}.`
			);
		} catch {
			toast.show(`Could not ${enabled ? 'enable' : 'pause'} ${name}'s sources.`);
			await you.load();
		} finally {
			const next = new Set(busyPersonIds);
			next.delete(personId);
			busyPersonIds = next;
		}
	}

	async function catchUpCreator(personId: string, name: string) {
		busyPersonIds = new Set(busyPersonIds).add(personId);
		try {
			const result = await you.refreshPerson(personId);
			toast.show(
				result.checked === 0
					? `Enable one of ${name}'s sources before checking.`
					: result.failed
						? `Checked ${result.checked} sources; ${result.failed} still failed.`
						: `Caught up with ${name}.`
			);
		} catch {
			toast.show(`Could not catch up with ${name}.`);
		} finally {
			const next = new Set(busyPersonIds);
			next.delete(personId);
			busyPersonIds = next;
		}
	}

	async function setFeedEnabled(personId: string, feedId: string, label: string, enabled: boolean) {
		busyFeedIds = new Set(busyFeedIds).add(feedId);
		try {
			const status = await you.setFeedEnabled(personId, feedId, enabled);
			if (!enabled) {
				toast.show(`${label} paused. Its cached yips are hidden.`);
			} else if (status === 'failed' || status === 'missing') {
				toast.show(`${label} is on, but could not catch up yet.`);
			} else {
				toast.show(`${label} is on and caught up.`);
			}
		} catch {
			toast.show(`Could not change ${label}.`);
			await you.load();
		} finally {
			const next = new Set(busyFeedIds);
			next.delete(feedId);
			busyFeedIds = next;
		}
	}

	function exportFollows() {
		if (!you.rows.length) return;
		downloadTextFile('yipden-follows.opml', you.toOpml());
		toast.show('Saved yipden-follows.opml.');
	}

	async function importFollows() {
		importing = true;
		try {
			const text = await pickTextFile('.opml,.xml,text/xml,text/x-opml');
			if (!text) return;
			const { people, feeds } = await you.importOpml(text);
			toast.show(
				people === 0
					? 'Nothing new to import from that file.'
					: `Imported ${people} ${people === 1 ? 'person' : 'people'}, ${feeds} ${feeds === 1 ? 'feed' : 'feeds'}.`
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
			backupPreview = null;
			theme.hydrate();
			const skipped = report.peopleSkipped + report.feedsSkipped;
			toast.show(
				`Restored ${report.peopleAdded} people, ${report.feedsAdded} sources, and ${report.yipsAdded} cached yips${skipped ? `; skipped ${skipped} conflicts` : ''}.`
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

<svelte:head><title>You</title></svelte:head>

<div class="scroll" inert={aboutOpen} aria-hidden={aboutOpen}>
	<header class="head" in:fly={flyIn()}>
		<p class="eyebrow">You {'·'} on this phone</p>
		<h2 class="screen-title">Your <em>den</em>.</h2>
		<p class="lede">Everything here lives on this phone. Reading never needs an account.</p>
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
			<h3 class="grp-h">
				Following
				<span>
					{you.rows.length}
					{you.rows.length === 1 ? 'person' : 'people'}
					{'·'}
					{you.rows.reduce((sum, row) => sum + row.feeds.length, 0)} feeds
				</span>
			</h3>
			<div class="rows">
				{#if !you.loaded}
					<p class="empty">Loading{'…'}</p>
				{:else if you.rows.length === 0}
					<p class="empty">You are not following anyone yet. Discover is a good place to start.</p>
				{:else}
					{#each you.rows as row, personIndex (row.person.id)}
						<div class="follow-person">
							<div class="srow person-row">
								<button
									class="person-toggle"
									aria-expanded={expandedIds.has(row.person.id)}
									aria-controls={`feeds-${personIndex}`}
									onclick={() => toggleExpanded(row.person.id)}
								>
									<span
										class="av"
										style:background-image={row.person.iconUrl ? `url(${row.person.iconUrl})` : ''}
									></span>
									<span class="tt">
										<b>{row.person.name}</b>
										<small>
											{row.feeds.filter((feed) => feed.enabled).length} of {row.feeds.length} sources
											active
											{'·'}
											{new URL(row.person.siteUrl).hostname.replace(/^www\./, '')}
										</small>
									</span>
									<svg
										class="chevron"
										class:open={expandedIds.has(row.person.id)}
										viewBox="0 0 24 24"
										aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg
									>
								</button>
								{#if confirmingId === row.person.id}
									<span class="confirm">
										<button
											class="mini-btn danger"
											onclick={() => confirmUnfollow(row.person.id, row.person.name)}
										>
											Unfollow
										</button>
										<button class="mini-btn" onclick={() => (confirmingId = null)}>Keep</button>
									</span>
								{:else}
									<button
										class="mini-btn"
										aria-label={`Unfollow ${row.person.name}`}
										onclick={() => (confirmingId = row.person.id)}
									>
										Unfollow
									</button>
								{/if}
							</div>
							{#if expandedIds.has(row.person.id)}
								<div class="feed-list" id={`feeds-${personIndex}`}>
									{#each row.feeds as feed, feedIndex (feed.id)}
										<div class:feed-problem={feed.failures > 0} class="feed-row">
											<span class="feed-mark" aria-hidden="true"
												>{feedKindLabel(feed.kind).slice(0, 1)}</span
											>
											<span class="feed-copy">
												<b>{feedKindLabel(feed.kind)}</b>
												<small>
													{feed.title !== row.person.name ? `${feed.title} · ` : ''}
													{hostOf(feed.url)}
													{feed.provenance === 'manual' ? ' · Added manually' : ''}
												</small>
												<small class:problem={feed.failures > 0}>{sourceStatus(feed)}</small>
											</span>
											<span class="feed-actions">
												{#if feed.failures > 0 && feed.enabled}
													<button
														class="source-btn"
														disabled={busyFeedIds.has(feed.id)}
														onclick={() =>
															retrySource(row.person.id, feed.id, feedKindLabel(feed.kind))}
														>Retry</button
													>
												{/if}
												{#if feed.provenance === 'manual'}
													{#if confirmingSourceId === feed.id}
														<button
															class="source-btn danger"
															onclick={() =>
																removeManualSource(
																	row.person.id,
																	feed.id,
																	feedKindLabel(feed.kind)
																)}>Remove</button
														>
														<button class="source-btn" onclick={() => (confirmingSourceId = null)}
															>Keep</button
														>
													{:else}
														<button
															class="source-btn"
															onclick={() => (confirmingSourceId = feed.id)}>Remove</button
														>
													{/if}
												{/if}
												<Switch
													id={`feed-${personIndex}-${feedIndex}`}
													label={`${feed.enabled ? 'Pause' : 'Enable'} ${feedKindLabel(feed.kind)} for ${row.person.name}`}
													checked={feed.enabled}
													disabled={busyFeedIds.has(feed.id)}
													onchange={(enabled) =>
														setFeedEnabled(
															row.person.id,
															feed.id,
															feedKindLabel(feed.kind),
															enabled
														)}
												/>
											</span>
										</div>
									{/each}
									<div class="source-manage">
										<div class="source-toolbar">
											<button
												class="source-btn"
												disabled={busyPersonIds.has(row.person.id) ||
													!row.feeds.some((feed) => feed.enabled)}
												onclick={() => catchUpCreator(row.person.id, row.person.name)}
												>Check now</button
											>
											<button
												class="source-btn"
												disabled={busyPersonIds.has(row.person.id) || row.feeds.length === 0}
												onclick={() =>
													setCreatorSources(
														row.person.id,
														row.person.name,
														!row.feeds.every((feed) => feed.enabled)
													)}
											>
												{row.feeds.every((feed) => feed.enabled) ? 'Pause all' : 'Enable all'}
											</button>
										</div>
										<button class="add-source" onclick={() => beginAddSource(row.person.id)}>
											{addingForId === row.person.id ? 'Cancel' : '+ Add source'}
										</button>
										{#if addingForId === row.person.id}
											<form class="source-form" onsubmit={findSources} novalidate>
												<label for={`source-${personIndex}`}>Feed, website, or profile link</label>
												<div class="source-field">
													<input
														id={`source-${personIndex}`}
														type="text"
														inputmode="url"
														autocomplete="off"
														autocapitalize="off"
														spellcheck="false"
														placeholder="youtube.com/@creator"
														bind:value={sourceInput}
													/>
													<button class="source-find" type="submit" disabled={sourceBusy}>
														{sourceBusy ? 'Looking…' : 'Find'}
													</button>
												</div>
												<p class="source-note">
													Manual sources stay unverified; YipDen still checks that they are safe and
													readable.
												</p>
												{#if sourceError}<p class="source-error">{sourceError}</p>{/if}
												{#each sourceMatches as source (source.url)}
													<div class="source-result">
														<span>
															<b>{feedKindLabel(source.kind)}</b>
															<small>{source.title} · {hostOf(source.url)}</small>
														</span>
														<button
															class="source-find"
															type="button"
															disabled={busySourceUrl !== null}
															onclick={() => attachSource(row.person.id, source)}
															>{busySourceUrl === source.url ? 'Adding…' : 'Add'}</button
														>
													</div>
												{/each}
											</form>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(3) })}>
			<h3 class="grp-h">Your follows file</h3>
			<div class="rows">
				<button class="srow link" onclick={exportFollows} disabled={!you.rows.length}>
					<span class="tt">
						<b>Export as OPML</b>
						<small>Take your follows to any other reader</small>
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

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(4) })}>
			<h3 class="grp-h">YipDen backup</h3>
			<div class="rows">
				<button class="srow link" onclick={exportYipDenBackup} disabled={backupBusy}>
					<span class="tt">
						<b>Export full backup</b>
						<small>Follows, sources, preferences, read state, and cached yips</small>
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
								cached yips. Existing data is kept; source conflicts are skipped.
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

		<section class="grp" in:fly={flyIn({ delay: staggerDelay(5) })}>
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

		<p class="fine" in:fly={flyIn({ delay: staggerDelay(6) })}>
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
		flex-direction: column;
		gap: 10px;
		padding: calc(26px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.eyebrow {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
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
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.grp-h span {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.02em;
		color: var(--muted);
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

	.empty {
		margin: 16px;
		color: var(--muted);
		font-size: 14px;
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

	.follow-person:not(:last-child) {
		border-bottom: 1px solid var(--line);
	}

	.follow-person > .srow {
		border-bottom: 0;
	}

	.person-row {
		gap: 8px;
	}

	.person-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		font: inherit;
	}

	.chevron {
		flex: 0 0 auto;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform var(--dur-s) var(--ease);
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.feed-list {
		border-top: 1px solid var(--line);
		background: color-mix(in srgb, var(--ground) 45%, var(--surface));
	}

	.feed-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 58px;
		padding: 6px 14px 6px 24px;
		border-bottom: 1px solid var(--line);
	}

	.feed-row:last-child {
		border-bottom: 0;
	}

	.feed-mark {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: var(--brand-soft);
		color: var(--brand-ink);
		font-family: var(--mono);
		font-size: 12px;
		font-weight: 700;
	}

	.feed-copy {
		flex: 1;
		min-width: 0;
	}

	.feed-copy b,
	.feed-copy small {
		display: block;
	}

	.feed-copy b {
		font-size: 13.5px;
		font-weight: 600;
	}

	.feed-copy small {
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.feed-row.feed-problem {
		background: color-mix(in srgb, var(--error) 5%, transparent);
	}

	.feed-copy small.problem {
		color: var(--error);
		white-space: normal;
	}

	.feed-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
	}

	.source-btn,
	.add-source,
	.source-find {
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--body);
		font-size: 12px;
		font-weight: 650;
	}

	.source-btn.danger {
		border-color: var(--error);
		background: var(--error);
		color: #fff;
	}

	.source-btn:disabled,
	.source-find:disabled {
		opacity: 0.55;
	}

	.source-toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.source-manage {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 14px 12px 24px;
	}

	.add-source {
		border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
		color: var(--brand-ink);
	}

	.source-form {
		display: flex;
		width: 100%;
		box-sizing: border-box;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.source-form > label {
		font-size: 12.5px;
		font-weight: 650;
	}

	.source-field {
		display: flex;
		gap: 8px;
	}

	.source-field input {
		min-width: 0;
		height: 44px;
		box-sizing: border-box;
		flex: 1;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
	}

	.source-field input:focus {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
	}

	.source-find {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
	}

	.source-note,
	.source-error {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.4;
	}

	.source-note {
		color: var(--muted);
	}

	.source-error {
		color: var(--error);
	}

	.source-result {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
	}

	.source-result > span {
		flex: 1;
		min-width: 0;
	}

	.source-result b,
	.source-result small {
		display: block;
	}

	.source-result b {
		font-size: 13px;
	}

	.source-result small {
		margin-top: 2px;
		overflow: hidden;
		color: var(--muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.feed-row {
			align-items: flex-start;
			flex-wrap: wrap;
		}

		.feed-actions {
			width: 100%;
			justify-content: flex-end;
			padding-left: 40px;
		}
	}

	.srow:disabled {
		opacity: 0.5;
	}

	.av {
		flex: 0 0 auto;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background-color: var(--brand-soft);
		background-size: cover;
		background-position: center;
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

	.mini-btn.danger {
		background: var(--error);
		border-color: var(--error);
		color: #fff;
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

	.confirm {
		display: flex;
		gap: 6px;
	}

	.fine {
		margin: 0;
		padding: 0 6px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
</style>
