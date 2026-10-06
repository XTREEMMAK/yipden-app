<script lang="ts" generics="T extends string">
	/**
	 * A small pill switch between two or three choices (Feeds' People | Forums, Follow's): a radio
	 * group drawn as one rounded control, the choice tinted in the brand color.
	 */

	interface Props {
		label: string;
		options: ReadonlyArray<{ value: T; label: string; badge?: number }>;
		value: T;
		onchange: (value: T) => void;
	}

	let { label, options, value, onchange }: Props = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
	{#each options as option (option.value)}
		<button
			role="radio"
			aria-checked={value === option.value}
			class:on={value === option.value}
			onclick={() => onchange(option.value)}
		>
			{option.label}
			{#if option.badge}<span class="badge">{option.badge}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		align-self: flex-start;
		gap: 4px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		transition:
			background var(--dur-s) var(--ease),
			color var(--dur-s) var(--ease);
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}

	button.on {
		background: var(--brand-soft);
		color: var(--brand-ink);
	}

	.badge {
		min-width: 20px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		text-align: center;
	}
</style>
