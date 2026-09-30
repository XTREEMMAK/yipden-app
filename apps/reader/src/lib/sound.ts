import { prefersReducedMotion } from './motion.js';
import { prefs } from './prefs.svelte.js';

/**
 * The little noises and buzzes YipDen makes, synthesized on the spot so there is no audio file to
 * ship, cache or license. Off when the reader turns Sounds off. A browser only lets audio start
 * after a tap, which is always the case here: every call comes from one.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
	if (typeof AudioContext === 'undefined') return null;
	context ??= new AudioContext();
	if (context.state === 'suspended') void context.resume();
	return context;
}

/** One bark: a fast upward chirp with a short, soft tail. */
function chirp(ctx: AudioContext, start: number, from: number, to: number, length: number) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	osc.type = 'triangle';
	filter.type = 'lowpass';
	filter.frequency.value = 2600;
	osc.frequency.setValueAtTime(from, start);
	osc.frequency.exponentialRampToValueAtTime(to, start + length * 0.7);
	osc.frequency.exponentialRampToValueAtTime(to * 0.85, start + length);
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
	osc.connect(filter).connect(gain).connect(ctx.destination);
	osc.start(start);
	osc.stop(start + length + 0.02);
}

/** "Yip!": two quick barks, the second a little higher. */
export function playYip(): void {
	if (!prefs.sounds) return;
	const ctx = audio();
	if (!ctx) return;
	const now = ctx.currentTime;
	chirp(ctx, now, 620, 1250, 0.11);
	chirp(ctx, now + 0.13, 760, 1500, 0.09);
}

/** A tiny buzz under the finger, where the device has one. */
export function tick(ms = 12): void {
	if (!prefs.sounds || prefersReducedMotion()) return;
	navigator.vibrate?.(ms);
}

/** What a like feels like: the yip and a buzz. */
export function celebrateLike(): void {
	playYip();
	tick(18);
}
