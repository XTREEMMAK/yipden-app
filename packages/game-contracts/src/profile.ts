import type { GameId, GameProfile } from './index.js';

export function gameProfile(value: string | undefined, fallback: GameProfile): GameProfile {
	const profile = value ?? fallback;
	if (!['thin', 'realm', 'stray', 'all'].includes(profile)) {
		throw new Error(`Unknown YIPDEN_GAMES profile: ${profile}. Use thin, realm, stray or all.`);
	}
	return profile as GameProfile;
}

export function selectedGames(profile: GameProfile): GameId[] {
	return profile === 'thin' ? [] : profile === 'all' ? ['realm', 'stray'] : [profile];
}
