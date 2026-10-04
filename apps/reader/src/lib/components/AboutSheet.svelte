<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import changelogMarkdown from '../../../../../CHANGELOG.md?raw';
	import { duration, flyIn, prefersReducedMotion } from '$lib/motion.js';
	import { openExternal } from '$lib/platform/external.js';

	interface Props {
		onclose: () => void;
	}

	interface ChangeGroup {
		title: string;
		items: string[];
	}

	interface ChangeRelease {
		title: string;
		groups: ChangeGroup[];
	}

	let { onclose }: Props = $props();
	let closeButton = $state<HTMLButtonElement | undefined>(undefined);
	let sheet = $state<HTMLElement | undefined>(undefined);
	let historyOpen = false;

	function plainMarkdown(value: string): string {
		return value
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/[`*_]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function parseChangelog(markdown: string): ChangeRelease[] {
		const releases: ChangeRelease[] = [];
		let release: ChangeRelease | null = null;
		let group: ChangeGroup | null = null;
		let item = -1;

		for (const rawLine of markdown.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (line.startsWith('## ')) {
				release = { title: plainMarkdown(line.slice(3)), groups: [] };
				releases.push(release);
				group = null;
				item = -1;
			} else if (release && line.startsWith('### ')) {
				group = { title: plainMarkdown(line.slice(4)), items: [] };
				release.groups.push(group);
				item = -1;
			} else if (group && line.startsWith('- ')) {
				group.items.push(plainMarkdown(line.slice(2)));
				item = group.items.length - 1;
			} else if (group && item >= 0 && line && !line.startsWith('#')) {
				group.items[item] = `${group.items[item]} ${plainMarkdown(line)}`.trim();
			}
		}
		return releases.filter((entry) => entry.groups.some((entryGroup) => entryGroup.items.length));
	}

	const changes = parseChangelog(changelogMarkdown);
	const attributions = [
		{
			name: 'Bricolage Grotesque, Instrument Sans, JetBrains Mono',
			license: 'SIL Open Font License 1.1'
		},
		{ name: 'Capacitor core, app, share and Android', license: 'MIT' },
		{ name: '@capgo/capacitor-media-session', license: 'MPL 2.0' },
		{ name: '@capgo/capacitor-inappbrowser', license: 'MPL 2.0' },
		{ name: '@capacitor-community/sqlite', license: 'MIT' },
		{ name: 'SQLCipher, © Zetetic LLC', license: 'BSD-style (zetetic.net/sqlcipher/license)' },
		{ name: '@rgrove/parse-xml', license: 'ISC' },
		{ name: 'Svelte and SvelteKit', license: 'MIT' },
		{ name: 'Platform icons: Simple Icons', license: 'CC0 1.0' },
		{
			name: 'IndieNodes members’ art, audio, writing and other work',
			license: 'Belongs to its creators'
		}
	];

	$effect(() => {
		closeButton?.focus();
	});

	onMount(() => {
		window.history.pushState(
			{ ...window.history.state, yipdenAbout: true },
			'',
			window.location.href
		);
		historyOpen = true;

		const onPopState = () => {
			if (!historyOpen) return;
			historyOpen = false;
			onclose();
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	});

	function scrollToSection(id: string) {
		sheet
			?.querySelector<HTMLElement>(`#${id}`)
			?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
			return;
		}
		if (event.key !== 'Tab' || !sheet) return;
		const controls = Array.from(
			sheet.querySelectorAll<HTMLElement>(
				'a[href], button:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
			)
		).filter((control) => control.getClientRects().length > 0);
		if (!controls.length) return;
		const first = controls[0]!;
		const last = controls.at(-1)!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function close() {
		if (historyOpen) window.history.back();
		else onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<button
	type="button"
	class="backdrop"
	tabindex="-1"
	aria-label="Close About"
	onclick={close}
	transition:fade={{ duration: prefersReducedMotion() ? 0 : duration.s }}
></button>
<div
	class="sheet"
	bind:this={sheet}
	role="dialog"
	aria-modal="true"
	aria-labelledby="aboutTitle"
	in:fly={flyIn({ y: 40 })}
	out:fly={flyIn({ y: 40 })}
>
	<header class="sheet-head">
		<div class="identity">
			<span class="mark" aria-hidden="true">
				<svg viewBox="0 0 1024 1024">
					<path
						d="M465 2c-96.8 3.3-166 18-224.5 47.8-40.2 20.5-99.4 69.5-135.6 112.2-60.1 71-85.5 130.7-97.8 230C5 408.3 5 412 5 716.2V1024h32l.3-306.7.3-306.8 2.7-16.5C52.5 319.6 69 272.1 97.6 229.4A439 439 0 0 1 229.3 97.7c24.2-16.2 44.8-26 76.7-36.8a549 549 0 0 1 137-25.4 993 993 0 0 1 138 0c70 4.2 137.6 20.8 187.3 46.2 14.4 7.4 57.7 36.6 57.7 39 0 .6-14.9 26.7-25.3 44.1-7.6 12.8-7.8 13.4-6.1 15.3 2.6 2.9 3.6 2.5 11.5-4.9l21.4-19.4c7.7-6.9 15-13.7 16.4-15.2 1.4-1.4 3-2.6 3.5-2.6 4.1 0 52.4 51.5 50.4 53.6-.6.5-53.2 19.4-66.5 23.8l-8.3 2.8v7.1l42.8-.8 49.7-.9 7-.1 6.7 10c25 37.3 44.5 94.3 53.7 156.9 2 13.8 2.1 16.3 2.1 323.7V1024h32l-.2-320.7-.3-320.8-2.2-11.5c-1.2-6.3-3-16.7-4.3-23-7.7-41.2-26-92.7-42.1-119-1.7-2.8-3-5.2-2.8-5.4.7-.5 36.2-2.7 44.3-2.7 13.5 0 13.5-.3-1.5-11s-23.3-17.9-36.5-31.7l-9.1-9.5-14.3 5.2c-13.7 5-14.5 5-16 3.4a602 602 0 0 0-41.2-45.4l-17.7-17.7 9.2-8.3 10-9c.8-.7-5.7-9.9-7.4-10.7l-11.6-8.1c-6-4.4-12.3-8.6-14-9.4l-3-1.6-6.3 11.4-6.3 11.4-8-6.2A661 661 0 0 0 811 66.5C735.8 16 631.3-3.4 465 2m221.4 116.7c-12.7 4.5-30.7 19.9-48 40.8-11 13.4-9.6 12.6-19 10.9-49-9-104.4 7-154.8 44.4l-9.8 7.2-14.6-2a288 288 0 0 0-69.7-2.6l-10.5 1.3a330 330 0 0 0-107.2 31.8c-24.7 12.5-25.3 15.8-6.6 34.6 11 11 29.8 25.6 38.8 30.3 3.1 1.6 4 3.5 1.7 3.5S248 337.3 237 344a697 697 0 0 0-81 58c-6.3 5.3-14.2 12-17.6 14.7-8 6.7-10.5 10-10.5 13.6 0 4.7 1.3 6 15.2 16.5C190.5 482 236.3 505.4 277 515c8.6 2 10 2.2 22.5 4 26.8 3.7 61.5-3 90.2-17.4 5.1-2.5 9.5-4.6 9.8-4.6 2.3 0-1.4 14-7.7 28.8l-3.9 9.3 1.8 3.7c2.5 5 5.6 5.8 16.4 4.3l8.6-1.2 3.5 3.5c2.6 2.6 4.8 3.7 9.5 4.6 9.8 2 9.8 2 .7 10.8a199 199 0 0 1-34.9 25.2c-16 8.8-15.7 16.5 1.3 25 6.5 3.2 7.1 4 4.7 6-.8.6-3.4 4.6-6 8.8-5.1 9-14.1 18-44 44.8-66.7 59.8-102.3 106.8-123 162.4-7.4 19.7-14.5 50.3-14.5 62.2 0 4 0 4-3.1 3.4-1.8-.3-7.4-2.7-12.5-5.2-38.9-19-71.6-62.4-83.9-111.1-5-20-6.6-34.9-6.4-58.1l.2-21.3-2.4-2.5c-3.9-3.8-8.8-4.2-12.7-1C85 704.8 74 727 68 745.9q-13.6 44.3-2.9 91.3l2 8.6-3.6 3.6c-5.5 5.5-4.6 12.7 3.7 29.2a117 117 0 0 0 16.2 22.7q1.2.6-.2 2.8a15 15 0 0 0-1.2 6c0 5 3.6 9.2 16.6 19.6 29 23.1 62.1 41.7 95.4 53.5a53 53 0 0 1 13.3 5.8c-.1.5 1.2 1.2 3 1.6 15.9 3 17.8 3.8 21 8 7 9 13.4 15.8 17.8 19l4.7 3.5h500.9l2.8-2.2c5.8-4.5 9.4-18.6 7.6-29.4-1.4-7.8-3-11.3-4-9.5q-1 1.1-4-4.3a59 59 0 0 0-21.9-20.7 44 44 0 0 1-7.3-4.2c-.4-.5-1.2-5-1.9-10-4.6-33.6 2.7-100.4 18-164.2 2.7-11 11-38 12.2-39 .3-.3 2.3 2.1 4.6 5.4 7.6 10.8 17 10.5 20.2-.6 3.3-11.7 2-47.9-2.3-67-1.3-5.7-2.2-10.3-2.1-10.3l8.5 4c10.5 5 13.7 5.2 17.8.4 2.8-3 3-4 2.5-7.2-1-5.7-10.2-27.4-21.2-50.7-15.8-33.2-27.6-62-30.6-74.6-1.3-5.4-1.2-6.3 1.6-17 8.8-33.6 27.9-87 35.7-99.9a281 281 0 0 0 32-74.2c8-34.4-1.3-62.4-20.7-61.8-2.6.1-5.5.1-6.4 0-.9 0-3.9-3.3-6.6-7.4-8.7-13-13.9-29.7-16.7-53.6-4.4-38.2-10.5-51.7-35.3-77.5l-17.4-18.2a31 31 0 0 0-33.4-8.5"
						fill="currentColor"
					/>
				</svg>
			</span>
			<span>
				<h2 id="aboutTitle">YipDen</h2>
				<small>v{__APP_VERSION__} · build {__BUILD_COMMIT__}</small>
			</span>
		</div>
		<button bind:this={closeButton} class="close" onclick={close} aria-label="Close About">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</header>

	<div class="body">
		<p class="intro">A mobile reader for the indie web. Follow people, not platforms.</p>
		<nav class="jump" aria-label="About sections">
			<button type="button" onclick={() => scrollToSection('about-discover')}>Discover</button>
			<button type="button" onclick={() => scrollToSection('about-posture')}>Posture</button>
			<button type="button" onclick={() => scrollToSection('about-privacy')}>Privacy</button>
			<button type="button" onclick={() => scrollToSection('about-history')}>Version history</button
			>
			<button type="button" onclick={() => scrollToSection('about-attributions')}
				>Attributions</button
			>
		</nav>

		<section class="about-section" id="about-discover">
			<p class="eyebrow">How Discover works</p>
			<h3>A ring, not a ranking.</h3>
			<p>
				Everyone in Discover comes from the IndieNodes webring, a directory of independent creators
				who chose to be listed. Each day opens on the same member for everyone, and you walk the
				rest by swiping. Nothing is ranked or recommended.
			</p>
		</section>

		<section class="about-section" id="about-posture">
			<p class="eyebrow">Posture</p>
			<h3>A doorway, not a destination.</h3>
			<p>
				Every yip links out to its creator’s own site. Nothing is ranked, and reading never needs an
				account or a change to anyone’s site. Links you save for later stay on this phone, in your
				Shelf, until you choose to export them.
			</p>
		</section>

		<section class="about-section" id="about-privacy">
			<p class="eyebrow">Privacy</p>
			<h3>Your den stays on your device.</h3>
			<p>
				YipDen has no account, analytics, ads, or tracking. Follows, reading state, preferences, and
				cached yips stay on this phone. Creators are not notified when you follow them.
			</p>
			<button
				class="text-link"
				type="button"
				onclick={() =>
					openExternal('https://github.com/XTREEMMAK/yipden-app/blob/main/docs/security.md')}
			>
				Read the privacy and security notes
			</button>
		</section>

		<section class="about-section" id="about-history">
			<p class="eyebrow">Version history</p>
			<h3>What changed</h3>
			<div class="changes">
				{#each changes as release}
					<details open={release.title === 'Unreleased'}>
						<summary>{release.title}</summary>
						{#each release.groups as group}
							<div class="change-group">
								<h4>{group.title}</h4>
								<ul>
									{#each group.items as change}
										<li>{change}</li>
									{/each}
								</ul>
							</div>
						{/each}
					</details>
				{/each}
			</div>
		</section>

		<section class="about-section" id="about-attributions">
			<p class="eyebrow">Attributions</p>
			<h3>Built with and around</h3>
			<ul class="credits">
				{#each attributions as credit}
					<li><span>{credit.name}</span><small>{credit.license}</small></li>
				{/each}
			</ul>
			<p class="license">YipDen is GPL-3.0-or-later.</p>
			<button
				class="text-link"
				type="button"
				onclick={() => openExternal('https://github.com/XTREEMMAK/yipden-app')}
			>
				View source and license
			</button>
		</section>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 34;
		padding: 0;
		border: 0;
		background: rgba(15, 6, 2, 0.6);
		cursor: default;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 35;
		display: flex;
		flex-direction: column;
		height: min(88vh, 760px);
		border-radius: 24px 24px 0 0;
		background: var(--ground);
		color: var(--ink);
		box-shadow: 0 -12px 30px -10px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px 12px 20px;
		border-bottom: 1px solid var(--line);
		background: var(--ground);
	}

	.identity {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.mark {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 48px;
		height: 48px;
		border-radius: 15px;
		background: var(--brand);
		color: #fff;
	}

	.mark svg {
		width: 31px;
		height: 31px;
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--display);
		font-size: 22px;
		line-height: 1;
	}

	.identity small {
		display: block;
		margin-top: 4px;
		color: var(--muted);
		font-family: var(--mono);
		font-size: 10.5px;
	}

	.close {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
	}

	.close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 18px 20px calc(24px + env(safe-area-inset-bottom, 0px));
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.intro {
		font-family: var(--display);
		font-size: 23px;
		font-weight: 650;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}

	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.jump button,
	.text-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 13px;
		border: 1px solid color-mix(in srgb, var(--brand) 42%, var(--line));
		border-radius: 999px;
		background: var(--surface);
		color: var(--brand-text);
		font: inherit;
		font-size: 12.5px;
		font-weight: 650;
		text-decoration: none;
	}

	.about-section {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
		scroll-margin-top: 12px;
	}

	.eyebrow {
		color: var(--brand-text);
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	h3 {
		font-family: var(--display);
		font-size: 20px;
		font-weight: 650;
	}

	.about-section > p:not(.eyebrow),
	.license {
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
	}

	.changes {
		width: 100%;
	}

	details {
		border-top: 1px solid var(--line);
	}

	details:first-child {
		border-top: 0;
	}

	summary {
		min-height: 44px;
		padding: 13px 2px 10px;
		color: var(--ink);
		font-size: 14px;
		font-weight: 650;
		cursor: pointer;
	}

	.change-group {
		padding: 4px 0 8px;
	}

	.change-group h4 {
		color: var(--brand-text);
		font-family: var(--mono);
		font-size: 11px;
		text-transform: uppercase;
	}

	.change-group ul {
		margin: 8px 0 0;
		padding-left: 20px;
	}

	.change-group li {
		margin-bottom: 8px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}

	.credits {
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.credits li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
		font-size: 12.5px;
	}

	.credits li:last-child {
		border-bottom: 0;
	}

	.credits span {
		min-width: 0;
	}

	.credits small {
		flex: 0 0 auto;
		max-width: 42%;
		color: var(--muted);
		font-size: 10.5px;
		text-align: right;
	}
</style>
