<script lang="ts">
	import { onDestroy } from 'svelte';
	import WaveSurfer from 'wavesurfer.js';
	import { player } from '$lib/player.svelte.js';
	import { formatTime } from '$lib/player.svelte.js';

	/**
	 * The waveform, and only the waveform: it draws, and nothing about playback depends on it.
	 *
	 * wavesurfer is handed the player's own shared audio element through `media`, so it never
	 * gets to call play or pause. Its separate job, decoding the file to compute peaks, is
	 * exactly the expensive part the brief warns about: it downloads and decodes the whole
	 * track. So nothing here happens until a track is actually loaded (which only occurs once
	 * the reader has pressed play), cached peaks skip the decode entirely when they exist, and
	 * a decode failure quietly falls back to a plain, still fully seekable progress bar.
	 */

	let container: HTMLDivElement | undefined;
	let ws: WaveSurfer | null = null;
	let failed = $state(false);
	let currentUrl: string | null = null;

	const WAVE_COLOR = 'rgba(255, 255, 255, 0.36)';
	const PROGRESS_COLOR = '#ffffff';

	async function loadTrack(mediaUrl: string): Promise<void> {
		if (!container || currentUrl === mediaUrl) return;
		currentUrl = mediaUrl;
		failed = false;

		ws?.destroy();
		ws = WaveSurfer.create({
			container,
			media: player.audio,
			height: 58,
			waveColor: WAVE_COLOR,
			progressColor: PROGRESS_COLOR,
			barWidth: 3,
			barGap: 2,
			barRadius: 2,
			cursorWidth: 0,
			interact: true,
			normalize: true
		});

		ws.on('error', () => {
			failed = true;
		});

		try {
			const cached = await player.readPeaks(mediaUrl);
			if (cached) {
				await ws.load(mediaUrl, [cached.peaks], cached.duration);
			} else {
				await ws.load(mediaUrl);
				// Only a track decoded here for the first time needs saving.
				const peaks = ws.exportPeaks({ maxLength: 200 })[0];
				if (peaks) await player.writePeaks(mediaUrl, peaks, ws.getDuration());
			}
		} catch {
			// Decoding failed, commonly a CORS refusal from a host that never expected this.
			// The brief is explicit: no error shown, just the plain bar below.
			failed = true;
		}
	}

	$effect(() => {
		const item = player.current;
		if (item) void loadTrack(item.mediaUrl);
	});

	onDestroy(() => {
		ws?.destroy();
	});

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

<div class="wave-wrap" data-noswipe>
	<div
		class="wave"
		class:hidden={failed}
		role="presentation"
		bind:this={container}
		onpointerdown={(e) => onPointerDown(e, e.currentTarget)}
		onpointermove={(e) => onPointerMove(e, e.currentTarget)}
		onpointerup={(e) => onPointerUp(e, e.currentTarget)}
		onpointercancel={(e) => onPointerUp(e, e.currentTarget)}
	></div>

	{#if failed}
		<div
			class="bar"
			role="presentation"
			onpointerdown={(e) => onPointerDown(e, e.currentTarget)}
			onpointermove={(e) => onPointerMove(e, e.currentTarget)}
			onpointerup={(e) => onPointerUp(e, e.currentTarget)}
			onpointercancel={(e) => onPointerUp(e, e.currentTarget)}
		>
			<div class="bar-fill" style:width={`${progress * 100}%`}></div>
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
		width: 100%;
		height: 100%;
	}

	.wave.hidden {
		visibility: hidden;
		position: absolute;
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
</style>
