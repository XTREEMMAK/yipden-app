<script lang="ts">
	import { onDestroy } from 'svelte';
	import { player } from '$lib/player.svelte.js';
	import { formatTime } from '$lib/player.svelte.js';
	import { barsFrom, peaksFrom } from '$lib/waveform.js';

	/**
	 * The waveform, and only the waveform: it draws, and nothing about playback depends on it.
	 *
	 * Playback is the player's own shared audio element. This reads the same file a second time to
	 * measure it, which is exactly the expensive part the brief warns about: the whole track is
	 * downloaded and decoded. So nothing here happens until a track is actually loaded (which only
	 * occurs once the reader has pressed play), the measurements are saved so a later play of the
	 * same track draws at once without decoding anything, and the decoded audio is let go the
	 * moment it has been measured.
	 *
	 * There is always something to seek on, and never an empty space. While the track is being
	 * measured the bars are already there at a low, even swell, breathing to say work is going
	 * on; when the real shape arrives each bar grows to its own height and the playhead fades in.
	 * A track that cannot be measured (commonly a CORS refusal from a host that never expected
	 * this) settles into a plain bar, with no error shown.
	 *
	 * The bars are drawn here from the saved numbers. wavesurfer.js used to do both the decoding
	 * and the drawing; on a phone its waveform sometimes did not appear until the player was
	 * reopened, and its drawing could not be faded in or replaced while it worked.
	 */

	/** What a first decode costs is bounded by decoding at a low rate: the shape is all that is kept. */
	const DECODE_RATE = 8000;
	const BAR_WIDTH = 3;
	const BAR_GAP = 2;

	let peaks = $state<number[] | null>(null);
	let status = $state<'working' | 'ready' | 'failed'>('working');
	let width = $state(0);
	let currentUrl: string | null = null;
	let abort: AbortController | null = null;

	async function measure(mediaUrl: string, signal: AbortSignal): Promise<number[]> {
		const response = await fetch(mediaUrl, { signal });
		if (!response.ok) throw new Error(`waveform: ${response.status}`);
		const bytes = await response.arrayBuffer();
		const context = new AudioContext({ sampleRate: DECODE_RATE });
		try {
			const audio = await context.decodeAudioData(bytes);
			const measured = peaksFrom(audio.getChannelData(0));
			await player.writePeaks(mediaUrl, measured, audio.duration);
			return measured;
		} finally {
			void context.close();
		}
	}

	async function loadTrack(mediaUrl: string): Promise<void> {
		if (currentUrl === mediaUrl) return;
		currentUrl = mediaUrl;
		abort?.abort();
		const controller = (abort = new AbortController());
		peaks = null;
		status = 'working';

		try {
			const cached = await player.readPeaks(mediaUrl);
			const next = cached?.peaks.length ? cached.peaks : await measure(mediaUrl, controller.signal);
			if (currentUrl !== mediaUrl) return;
			peaks = next;
			status = next.length ? 'ready' : 'failed';
		} catch (error) {
			if (currentUrl !== mediaUrl) return;
			// The brief is explicit: no error shown, just the plain bar. Development builds say why
			// in the console, since the reader-facing silence otherwise hides it.
			if (import.meta.env.DEV) console.warn('waveform: could not measure', mediaUrl, error);
			status = 'failed';
		}
	}

	$effect(() => {
		const item = player.current;
		if (!item) return;
		if (player.source) {
			// A platform's player: its own waveform when it gives one (SoundCloud), else the plain
			// bar. Its audio is never ours to download and measure.
			abort?.abort();
			currentUrl = null;
			const given = player.embedPeaks;
			peaks = given?.length ? given : null;
			status = given === null ? 'working' : given.length ? 'ready' : 'failed';
			return;
		}
		void loadTrack(item.mediaUrl);
	});

	onDestroy(() => {
		abort?.abort();
	});

	let barCount = $derived(Math.max(0, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP))));
	let bars = $derived(peaks && barCount ? barsFrom(peaks, barCount) : []);

	/** The stand-in shape while a track is measured: a gentle swell, the same for every track. */
	function waiting(at: number): number {
		return 0.22 + 0.14 * Math.sin(at * 0.55) + 0.08 * Math.sin(at * 1.7);
	}

	function seekAt(clientX: number, rect: DOMRect): void {
		const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		player.seek(fraction * player.duration);
	}

	let dragging = false;

	function onPointerDown(event: PointerEvent, node: HTMLElement): void {
		if (!player.duration) return;
		dragging = true;
		node.setPointerCapture(event.pointerId);
		seekAt(event.clientX, node.getBoundingClientRect());
	}

	function onPointerMove(event: PointerEvent, node: HTMLElement): void {
		if (!dragging) return;
		seekAt(event.clientX, node.getBoundingClientRect());
	}

	function onPointerUp(event: PointerEvent, node: HTMLElement): void {
		dragging = false;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
	}

	let progress = $derived(player.duration > 0 ? player.currentTime / player.duration : 0);
</script>

<div
	class="wave-wrap"
	data-noswipe
	role="presentation"
	bind:clientWidth={width}
	onpointerdown={(e) => onPointerDown(e, e.currentTarget)}
	onpointermove={(e) => onPointerMove(e, e.currentTarget)}
	onpointerup={(e) => onPointerUp(e, e.currentTarget)}
	onpointercancel={(e) => onPointerUp(e, e.currentTarget)}
>
	{#if status === 'failed'}
		<div class="bar" aria-hidden="true">
			<div class="bar-fill" style:width={`${progress * 100}%`}></div>
		</div>
	{:else}
		{@const ready = status === 'ready' && bars.length === barCount}
		<div class="wave" class:working={!ready} aria-hidden="true">
			{#each { length: barCount }, at (at)}
				<i
					class:played={ready && (at + 0.5) / barCount <= progress}
					style:height={`${4 + (ready ? (bars[at] ?? 0) : waiting(at)) * 96}%`}
				></i>
			{/each}
			{#if ready}
				<span class="cursor" style:left={`${progress * 100}%`}></span>
			{/if}
		</div>
	{/if}

	<!-- The keyboard and screen reader path, always present regardless of how the track above
	     renders: a real range input, backing whichever visual is showing. -->
	<input
		class="visually-hidden"
		type="range"
		min="0"
		max="1000"
		value={Math.round(progress * 1000)}
		aria-label="Seek"
		aria-valuetext={`${formatTime(player.currentTime)} of ${formatTime(player.duration)}`}
		oninput={(event) => player.seek((Number(event.currentTarget.value) / 1000) * player.duration)}
	/>
</div>

<style>
	.wave-wrap {
		position: relative;
		align-self: stretch;
		height: 58px;
		margin-top: 10px;
		cursor: pointer;
		touch-action: none;
	}

	.wave {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		gap: 2px;
	}

	/* Each bar grows from the waiting swell to its own height when the real shape arrives. */
	.wave i {
		flex: 0 0 3px;
		min-height: 3px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.36);
		transition:
			height var(--dur-l) var(--ease),
			background-color var(--dur-s) var(--ease);
	}

	.wave i.played {
		background: #fff;
	}

	/* Being measured: the whole swell breathes, as one layer, until the waveform takes over. */
	.wave.working {
		animation: wave-working 0.9s ease-in-out infinite alternate;
	}

	@keyframes wave-working {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 0.9;
		}
	}

	/* Not white and not the player's orange, so the playhead reads against played and unplayed bars. */
	.cursor {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		margin-left: -1.5px;
		border-radius: 2px;
		background: #5fe3ff;
		animation: cursor-in var(--dur-l) var(--ease) both;
	}

	@keyframes cursor-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.bar {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		height: 100%;
	}

	.bar::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 4px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.28);
	}

	.bar-fill {
		position: relative;
		height: 4px;
		border-radius: 4px;
		background: #fff;
	}

	@media (prefers-reduced-motion: reduce) {
		.wave.working {
			animation: none;
			opacity: 0.6;
		}

		.wave i {
			transition-duration: var(--dur-s);
		}
	}
</style>
