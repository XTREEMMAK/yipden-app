/** Host capabilities are injected. No engine, framework, native API or storage implementation. */
export type GameId = 'realm' | 'stray';
export type GameProfile = 'thin' | GameId | 'all';
export type JsonValue =
	null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface GameSaveStore {
	read(game: GameId): Promise<JsonValue | null>;
	write(game: GameId, value: JsonValue): Promise<void>;
}

export interface GamePage {
	id: string;
	mode: 'fixture' | 'capture' | 'cooperative' | 'native';
}

export interface GameHost {
	surface: 'reader' | 'lab';
	saves: GameSaveStore;
	page: GamePage | null;
	beforeStart(): void | Promise<void>;
	requestExit(): void;
}

export interface GameMountOptions {
	target: HTMLElement;
	host: GameHost;
	signal: AbortSignal;
}

export interface GameSession {
	pause(): void | Promise<void>;
	resume(): void | Promise<void>;
	destroy(): void | Promise<void>;
}

export interface GameModule {
	mount(options: GameMountOptions): Promise<GameSession>;
}

/** Only metadata and loaders belong in the startup graph. */
export interface GameEntry {
	id: GameId;
	title: string;
	description: string;
	load(): Promise<GameModule>;
}
