<script lang="ts">
	/**
	 * A switch that is a real checkbox.
	 *
	 * The input is visually hidden rather than replaced, so it keeps its own focus, its own
	 * keyboard behavior and its own announcement. `role="switch"` tells a screen reader what
	 * kind of control it is; everything else is the platform's.
	 */

	interface Props {
		checked: boolean;
		id: string;
		label: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	}

	let { checked = $bindable(), id, label, disabled = false, onchange }: Props = $props();
</script>

<span class="switch">
	<input
		class="switch-input"
		type="checkbox"
		role="switch"
		{id}
		aria-label={label}
		{disabled}
		bind:checked
		onchange={(event) => onchange?.(event.currentTarget.checked)}
	/>
	<span class="track" class:on={checked} aria-hidden="true"></span>
</span>

<style>
	/*
	 * Establishes its own positioning context.
	 *
	 * The hidden input below is position: absolute with no top or left, meaning it sits at
	 * (0, 0) of whatever ancestor is positioned -- or, with no positioned ancestor at all, at
	 * (0, 0) of the page. Every switch on a screen would then collapse onto the same point and
	 * intercept each other's clicks and taps, invisibly. This wrapper is the fix, not the
	 * caller's job.
	 */
	/*
	 * The visual track stays the prototype's 46x28 pill, but the tappable area around it grows
	 * to the brief's 44px touch target floor rather than matching the track's own size, the
	 * same reasoning as Feeds' pills.
	 */
	.switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		min-width: 44px;
		min-height: 44px;
	}

	/*
	 * Deliberately not the shared .visually-hidden utility from app.css: that class is
	 * !important and clips to 1x1px, which is right for text meant only for a screen reader
	 * but wrong for a control that has to receive real clicks and taps. This one is invisible
	 * but full sized, the standard pattern for a native input styled as something else.
	 */
	.switch-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.switch-input:disabled {
		cursor: wait;
	}

	.switch:has(.switch-input:disabled) {
		opacity: 0.55;
	}

	.track {
		position: relative;
		/* Decorative and aria-hidden; the input above it is the real target for every click. */
		pointer-events: none;
		flex: 0 0 auto;
		width: 46px;
		height: 28px;
		border-radius: 999px;
		background: var(--switch-off);
		transition: background var(--dur-s) var(--ease);
	}

	.track::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform var(--dur-s) var(--ease);
	}

	.track.on {
		background: var(--brand);
	}

	.track.on::after {
		transform: translateX(18px);
	}

	/* The focus ring belongs to the input, so show it on the thing people actually see. */
	:global(input:focus-visible + .track) {
		outline: 2px solid var(--brand-text);
		outline-offset: 2px;
	}
</style>
