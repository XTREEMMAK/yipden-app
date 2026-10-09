declare module 'virtual:yipden-games' {
	import type { GameEntry, GameProfile } from '@yipden/game-contracts';
	export const games: readonly GameEntry[];
	export const profile: GameProfile;
}
declare module 'virtual:yipden-game-references' {
	import type { GameId } from '@yipden/game-contracts';
	export const references: Partial<Record<GameId, string>>;
}
