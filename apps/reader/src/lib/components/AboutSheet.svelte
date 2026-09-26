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
		{ name: 'wavesurfer.js', license: 'BSD 3-Clause' },
		{ name: 'Capacitor core, app and Android', license: 'MIT' },
		{ name: '@capgo/capacitor-media-session', license: 'MPL 2.0' },
		{ name: '@rgrove/parse-xml', license: 'ISC' },
		{ name: 'Svelte and SvelteKit', license: 'MIT' },
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
				<svg viewBox="0 0 32 32">
					<path d="M4 27V17a12 12 0 0 1 24 0v10" />
					<path class="door" d="M11 27v-6.5a5 5 0 0 1 10 0V27z" />
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
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
	}

	.mark .door {
		fill: currentColor;
		stroke: none;
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
