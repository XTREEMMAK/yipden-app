import { describe, expect, it } from 'vitest';
import { barsFrom, peaksFrom } from './waveform.js';

describe('peaksFrom', () => {
	it('takes the loudest sample of each slice, whatever its sign', () => {
		const samples = new Float32Array([0.1, -0.5, 0.2, 0.25, -0.75, 0, 0.3, 0.1]);
		expect(peaksFrom(samples, 4)).toEqual([0.5, 0.25, 0.75, 0.3]);
	});

	it('still returns every slice for a track shorter than the slice count', () => {
		expect(peaksFrom(new Float32Array([0.5, 0.25]), 4)).toHaveLength(4);
	});

	it('is empty for no audio at all', () => {
		expect(peaksFrom(new Float32Array(0), 4)).toEqual([]);
	});
});

describe('barsFrom', () => {
	it('brings the loudest bar to full height', () => {
		expect(barsFrom([0.1, 0.2, 0.4, 0.2], 4)).toEqual([0.25, 0.5, 1, 0.5]);
	});

	it('folds many peaks into fewer bars by the loudest in each', () => {
		expect(barsFrom([0.1, 0.5, 0.2, 0.25], 2)).toEqual([1, 0.5]);
	});

	it('reads peaks saved with a sign', () => {
		expect(barsFrom([-0.5, 0.25], 2)).toEqual([1, 0.5]);
	});

	it('leaves silence flat rather than dividing by zero', () => {
		expect(barsFrom([0, 0], 2)).toEqual([0, 0]);
	});
});
