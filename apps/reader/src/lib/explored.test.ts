import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { resumeIndex } from './explored.svelte.js';

describe('resumeIndex', () => {
	const urls = [
		'https://a.example/',
		'https://b.example/',
		'https://c.example/',
		'https://d.example/'
	];
	const marked =
		(...indexes: number[]) =>
		(url: string) =>
			indexes.some((i) => urls[i] === url);

	it('starts at the top when nothing is explored', () => {
		expect(resumeIndex(urls, marked())).toBe(0);
	});

	it('picks up after the last explored member, not at the first gap', () => {
		expect(resumeIndex(urls, marked(0, 2))).toBe(3);
	});

	it('goes back to an earlier gap once the end is explored', () => {
		expect(resumeIndex(urls, marked(0, 2, 3))).toBe(1);
	});

	it('is null when every member is explored', () => {
		expect(resumeIndex(urls, marked(0, 1, 2, 3))).toBeNull();
	});
});
