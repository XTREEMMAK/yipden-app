/**
 * A track's waveform as numbers: the loudest sample in each of a fixed number of slices.
 *
 * Kept apart from the component that draws it so the arithmetic is checkable on its own. What is
 * saved per track is `PEAK_COUNT` values, a few hundred bytes, which is all a later play needs.
 */

/** How many slices a track is cut into for saving. More than any phone has room to draw. */
export const PEAK_COUNT = 200;

/** The loudest sample (ignoring sign) in each of `count` equal slices of `samples`. */
export function peaksFrom(samples: Float32Array, count = PEAK_COUNT): number[] {
	const size = samples.length / count;
	if (!samples.length || count <= 0) return [];
	const peaks: number[] = [];
	for (let slice = 0; slice < count; slice += 1) {
		const from = Math.floor(slice * size);
		const to = Math.max(from + 1, Math.floor((slice + 1) * size));
		let loudest = 0;
		for (let at = from; at < to && at < samples.length; at += 1) {
			const value = Math.abs(samples[at] ?? 0);
			if (value > loudest) loudest = value;
		}
		// Three decimals: a bar a few dozen pixels tall cannot show more.
		peaks.push(Math.round(loudest * 1000) / 1000);
	}
	return peaks;
}

/**
 * Saved peaks as `count` bar heights from 0 to 1, the loudest bar always full height, so a quiet
 * recording still draws a waveform rather than a flat line. Signs are ignored: peaks saved by an
 * earlier version of the player could be negative.
 */
export function barsFrom(peaks: number[], count: number): number[] {
	if (!peaks.length || count <= 0) return [];
	const bars: number[] = [];
	for (let bar = 0; bar < count; bar += 1) {
		const from = Math.floor((bar * peaks.length) / count);
		const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / count));
		let loudest = 0;
		for (let at = from; at < to && at < peaks.length; at += 1) {
			loudest = Math.max(loudest, Math.abs(peaks[at] ?? 0));
		}
		bars.push(loudest);
	}
	const top = Math.max(...bars);
	return top > 0 ? bars.map((bar) => bar / top) : bars;
}

/**
 * SoundCloud's own waveform (the `waveform_url` its player reports, `wave.sndcdn.com/….json`):
 * bar heights out of `height`, turned into peaks like ours so it draws and saves the same way.
 * Anything not shaped like that gives no peaks, and the plain bar is drawn instead.
 */
export function peaksFromWaveformJson(data: unknown, count = PEAK_COUNT): number[] {
	if (!data || typeof data !== 'object') return [];
	const { samples, height } = data as { samples?: unknown; height?: unknown };
	if (!Array.isArray(samples) || typeof height !== 'number' || !(height > 0)) return [];
	const values = samples
		.slice(0, 20_000)
		.map((value) =>
			typeof value === 'number' && Number.isFinite(value)
				? Math.min(1, Math.max(0, value / height))
				: 0
		);
	return peaksFrom(Float32Array.from(values), Math.min(count, values.length));
}
