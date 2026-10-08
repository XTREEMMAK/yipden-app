<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Toast from '$components/Toast.svelte';
	import { hostOf } from '$lib/hosts.js';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { REFRESH_CHOICES, siteFollows } from '$lib/siteFollows.svelte.js';
	import { toast } from '$lib/toast.svelte.js';

	/**
	 * The sites a reader follows: how often each is checked, and unfollowing it. A site is a place,
	 * not a person, so like forums it has this screen and not a row among the people on You.
	 */

	let confirming = $state<string | null>(null);

	onMount(() => {
		void siteFollows.load();
	});

	const STATUS: Record<string, string> = {
		gone: 'Not there any more',
		blocked: 'Asks not to be read by apps',
		'not-a-feed': 'No feed at this address now',
		unreachable: 'Could not be reached'
	};

	function lastChecked(at: string | undefined): string {
		return at
			? `Checked ${new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
			: 'Not checked yet';
	}

	async function unfollow(id: string, title: string) {
		await siteFollows.unfollow(id);
		confirming = null;
		toast.show(`Unfollowed ${title}.`);
	}
</script>

<svelte:head><title>Sites</title></svelte:head>

<div class="scroll">
	<header class="head" in:fly={flyIn()}>
		<button class="back" onclick={() => goto('/you')} aria-label="Back to You">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
		</button>
		<h2 class="screen-title">Sites</h2>
	</header>

	<div class="groups">
		{#if !siteFollows.loaded}
			<p class="empty">Loading{'…'}</p>
		{:else if siteFollows.follows.length === 0}
			<p class="empty">
				No sites yet. Follow one from Surf, or paste its address in Follow, to read its new posts in
				Feeds.
			</p>
			<a class="btn" href="/follow">Follow a den</a>
		{:else}
			{#each siteFollows.follows as follow, index (follow.id)}
				<section
					class="site"
					aria-labelledby={`site-${index}`}
					in:fly={flyIn({ delay: staggerDelay(index) })}
				>
					<div class="site-head">
						<span
							class="logo"
							style:background-image={follow.iconUrl ? `url(${follow.iconUrl})` : ''}
						></span>
						<span class="copy">
							<b id={`site-${index}`}>{follow.title}</b>
							<small>{hostOf(follow.siteUrl)}</small>
							<small>
								{lastChecked(follow.lastCheckedAt)}{#if follow.status !== 'ok'}
									{' · '}<span class="warn">{STATUS[follow.status]}</span>{/if}
							</small>
						</span>
					</div>

					<label class="row" for={`refresh-${index}`}>
						<span>Check for new posts</span>
						<select
							id={`refresh-${index}`}
							value={follow.refreshHours}
							onchange={(event) =>
								siteFollows.setRefreshHours(follow.id, Number(event.currentTarget.value))}
						>
							{#each REFRESH_CHOICES as hours (hours)}
								<option value={hours}>{hours === 24 ? 'Once a day' : `Every ${hours} hours`}</option
								>
							{/each}
						</select>
					</label>

					<div class="actions">
						{#if confirming === follow.id}
							<button class="btn danger" onclick={() => unfollow(follow.id, follow.title)}
								>Unfollow</button
							>
							<button class="btn" onclick={() => (confirming = null)}>Keep</button>
						{:else}
							<button
								class="btn"
								aria-label={`Unfollow ${follow.title}`}
								onclick={() => (confirming = follow.id)}>Unfollow</button
							>
						{/if}
					</div>
				</section>
			{/each}
		{/if}
	</div>

	<Toast />
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: calc(26px + env(safe-area-inset-top, 0px)) 20px 12px;
	}

	.back {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
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
		gap: 18px;
		padding: 4px 16px 24px;
	}

	.site {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.site-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.logo {
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background-color: var(--brand-soft);
		background-position: center;
		background-size: contain;
		background-repeat: no-repeat;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.copy b {
		font-size: 16px;
		font-weight: 650;
	}

	.copy small {
		color: var(--muted);
		font-size: 12.5px;
	}

	.warn {
		color: var(--error);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 44px;
		font-size: 14px;
	}

	select {
		min-height: 44px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 14px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: none;
	}

	.btn.danger {
		border-color: var(--error);
		background: var(--error);
		color: #fff;
	}

	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.45;
	}
</style>
