<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ForumCategory } from '@yipden/feeds';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import ForumPicker, { type ForumChoice } from '$components/ForumPicker.svelte';
	import Toast from '$components/Toast.svelte';
	import { forums, namesOf, REFRESH_CHOICES } from '$lib/forums.svelte.js';
	import { flyIn, staggerDelay } from '$lib/motion.js';
	import { toast } from '$lib/toast.svelte.js';

	/**
	 * The forums a reader follows: for each, what of it is followed, how often it is checked, and
	 * unfollowing it. Forums stand on their own, so they have this screen rather than a row among
	 * the people on You.
	 */

	/** The forum whose categories are being changed, with its categories once read. */
	let editing = $state<{ forumUrl: string; categories: ForumCategory[] | null } | null>(null);
	let confirming = $state<string | null>(null);
	let busy = $state(false);

	onMount(() => {
		void forums.load();
	});

	const STATUS: Record<string, string> = {
		'members-only': 'Members-only now',
		gone: 'Not there any more',
		unreachable: 'Could not be reached'
	};

	function followedLabel(forum: (typeof forums.forums)[number]): string {
		const whole = forum.follows.some((follow) => follow.categoryId === null);
		if (whole) return 'The whole forum';
		return forum.follows
			.map((follow) => follow.categoryName ?? `Category ${follow.categoryId}`)
			.join(', ');
	}

	function lastChecked(forum: (typeof forums.forums)[number]): string {
		const times = forum.follows
			.map((follow) => follow.lastCheckedAt)
			.filter((at): at is string => !!at)
			.sort();
		const last = times[times.length - 1];
		return last
			? `Checked ${new Date(last).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
			: 'Not checked yet';
	}

	async function edit(forumUrl: string) {
		editing = { forumUrl, categories: null };
		const categories = await forums.categoriesOf(forumUrl).catch(() => [] as ForumCategory[]);
		if (editing?.forumUrl !== forumUrl) return;
		if (categories === 'members-only') {
			toast.show('That forum is members-only now, so its categories cannot be read.');
			editing = null;
			return;
		}
		editing = { forumUrl, categories };
	}

	async function save(forum: (typeof forums.forums)[number], choice: ForumChoice) {
		if (busy || !editing) return;
		busy = true;
		try {
			const first = forum.follows[0]!;
			await forums.follow(
				{
					baseUrl: forum.forumUrl,
					title: forum.title,
					description: first.description ?? '',
					logoUrl: forum.logoUrl ?? null
				},
				choice,
				namesOf(editing.categories ?? [])
			);
			editing = null;
			toast.show(`Following ${forum.title} as chosen.`);
		} finally {
			busy = false;
		}
	}

	async function unfollow(forumUrl: string, title: string) {
		await forums.unfollow(forumUrl);
		confirming = null;
		toast.show(`Unfollowed ${title}.`);
	}
</script>

<svelte:head><title>Forums</title></svelte:head>

<div class="scroll">
	<header class="head" in:fly={flyIn()}>
		<button class="back" onclick={() => goto('/you')} aria-label="Back to You">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
		</button>
		<h2 class="screen-title">Forums</h2>
	</header>

	<div class="groups">
		{#if !forums.loaded}
			<p class="empty">Loading{'…'}</p>
		{:else if forums.forums.length === 0}
			<p class="empty">
				No forums yet. Paste a link to any page of a public forum in Follow to follow the forum or
				some of its categories.
			</p>
			<a class="btn" href="/follow">Follow a forum</a>
		{:else}
			{#each forums.forums as forum, index (forum.forumUrl)}
				<section
					class="forum"
					aria-labelledby={`forum-${index}`}
					in:fly={flyIn({ delay: staggerDelay(index) })}
				>
					<div class="forum-head">
						<span class="logo" style:background-image={forum.logoUrl ? `url(${forum.logoUrl})` : ''}
						></span>
						<span class="copy">
							<b id={`forum-${index}`}>{forum.title}</b>
							<small>{followedLabel(forum)}</small>
							<small>
								{lastChecked(
									forum
								)}{#each forum.follows.filter((follow) => follow.status !== 'ok') as follow (follow.id)}
									{' · '}<span class="warn">{STATUS[follow.status]}</span>{/each}
							</small>
						</span>
					</div>

					<label class="row" for={`refresh-${index}`}>
						<span>Check for new topics</span>
						<select
							id={`refresh-${index}`}
							value={forums.refreshHoursOf(forum.forumUrl)}
							onchange={(event) =>
								forums.setRefreshHours(forum.forumUrl, Number(event.currentTarget.value))}
						>
							{#each REFRESH_CHOICES as hours (hours)}
								<option value={hours}>{hours === 24 ? 'Once a day' : `Every ${hours} hours`}</option
								>
							{/each}
						</select>
					</label>

					{#if editing?.forumUrl === forum.forumUrl}
						<ForumPicker
							forum={{
								baseUrl: forum.forumUrl,
								title: forum.title,
								description: '',
								logoUrl: forum.logoUrl ?? null
							}}
							categories={editing.categories}
							initial={forum.follows.some((follow) => follow.categoryId === null)
								? { whole: true, ids: [] }
								: {
										whole: false,
										ids: forum.follows
											.map((follow) => follow.categoryId)
											.filter((id): id is number => id !== null)
									}}
							confirmLabel={() => 'Save what to follow'}
							{busy}
							onconfirm={(choice) => save(forum, choice)}
						/>
						<button class="btn" onclick={() => (editing = null)}>Cancel</button>
					{:else}
						<div class="actions">
							<button class="btn" onclick={() => edit(forum.forumUrl)}>Change categories</button>
							{#if confirming === forum.forumUrl}
								<button class="btn danger" onclick={() => unfollow(forum.forumUrl, forum.title)}
									>Unfollow</button
								>
								<button class="btn" onclick={() => (confirming = null)}>Keep</button>
							{:else}
								<button
									class="btn"
									aria-label={`Unfollow ${forum.title}`}
									onclick={() => (confirming = forum.forumUrl)}>Unfollow</button
								>
							{/if}
						</div>
					{/if}
				</section>
			{/each}
		{/if}

		<section class="quiet">
			<label class="row" for="forum-quiet">
				<span
					>Drop a topic after <b
						>{forums.quietDays} quiet {forums.quietDays === 1 ? 'day' : 'days'}</b
					></span
				>
			</label>
			<input
				id="forum-quiet"
				type="range"
				min="3"
				max="60"
				value={forums.quietDays}
				onchange={(event) => forums.setQuietDays(Number(event.currentTarget.value))}
			/>
			<p class="note">
				Topics come and go by themselves. One with no new posts for this long leaves the list, and
				what you had seen of it goes too.
			</p>
		</section>
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

	.forum,
	.quiet {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-group);
		background: var(--surface);
	}

	.forum-head {
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

	input[type='range'] {
		width: 100%;
		min-height: 44px;
		accent-color: var(--brand);
	}

	.note,
	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.45;
	}
</style>
