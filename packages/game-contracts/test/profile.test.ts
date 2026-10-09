import { describe, expect, it } from 'vitest';
import { gameProfile, selectedGames } from '../src/profile.js';

describe('build capabilities', () => {
	it('uses an explicit safe default and refuses misspelled profiles', () => {
		expect(gameProfile(undefined, 'thin')).toBe('thin');
		expect(() => gameProfile('raelm', 'thin')).toThrow('Unknown');
	});
	it('selects only the requested games', () => {
		expect(selectedGames('thin')).toEqual([]);
		expect(selectedGames('realm')).toEqual(['realm']);
		expect(selectedGames('stray')).toEqual(['stray']);
		expect(selectedGames('all')).toEqual(['realm', 'stray']);
	});
});
