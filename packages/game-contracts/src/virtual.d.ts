declare module 'virtual:yipden-games' {
	import type { GameEntry, GameProfile } from '@yipden/game-contracts';
	export const games: readonly GameEntry[];
	export const profile: GameProfile;
}
