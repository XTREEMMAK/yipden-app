import type { GameId, GameProfile } from './index.js';

export function gameProfile(value: string | undefined, fallback: GameProfile): GameProfile {
	const profile = value ?? fallback;
	if (!['thin', 'stray'].includes(profile)) {
		throw new Error(`Unknown YIPDEN_GAMES profile: ${profile}. Use thin or stray.`);
	}
	return profile as GameProfile;
}

export function selectedGames(profile: GameProfile): GameId[] {
	return profile === 'thin' ? [] : [profile];
}
