<script lang="ts">
	/**
	 * A person, with a small mark at their lower right when it says something: an x to unfollow, a
	 * check for following, a plus to follow. One drawing for every place the app needs a person, so
	 * they cannot drift apart. Decorative: the button around it carries the words.
	 */

	interface Props {
		mark?: 'none' | 'remove' | 'check' | 'add';
		size?: number;
	}

	let { mark = 'none', size = 22 }: Props = $props();
</script>

<svg
	class="person-icon"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	aria-hidden="true"
	fill="none"
	stroke="currentColor"
	stroke-width="1.9"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	{#if mark === 'none'}
		<circle cx="12" cy="8.5" r="3.8" />
		<path d="M4.5 20c.9-4 3.9-6 7.5-6s6.6 2 7.5 6" />
	{:else}
		<!-- The person a little to the left, leaving the lower right to the mark. -->
		<circle cx="9.5" cy="8" r="3.6" />
		<path d="M2.8 19.5c.8-3.7 3.5-5.6 6.7-5.6 1.6 0 3 .4 4.2 1.2" />
		{#if mark === 'remove'}
			<path d="M16.5 15.5l5 5M21.5 15.5l-5 5" />
		{:else if mark === 'check'}
			<path d="M15.8 18.2l2.2 2.2 4-4.4" />
		{:else}
			<path d="M19 14.5v6M16 17.5h6" />
		{/if}
	{/if}
</svg>

<style>
	.person-icon {
		flex: none;
		display: block;
	}
</style>
