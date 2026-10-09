import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { gameProfile, selectedGames } from '@yipden/game-contracts/profile';
import type { GameId, GameProfile } from './index.js';

const descriptors = {
	realm: {
		title: 'Realm',
		description: 'Page-aligned action game. Production player scaffold.',
		package: '@yipden/realm-player'
	},
	stray: {
		title: 'The Stray',
		description: 'A small-web pup hunt. Production player scaffold.',
		package: '@yipden/stray'
	}
};
const referenceFiles = {
	realm: 'YipDen_Game_Realm_Prototype-v2.html',
	stray: 'YipDen_Game_TheStray_Prototype.html'
};

/** A different module is resolved per build; thin never traverses game imports. */
export function gameBuild(options: { surface: 'reader' | 'lab'; fallback: GameProfile }): Plugin {
	const profile = gameProfile(process.env.YIPDEN_GAMES, options.fallback);
	const selected = selectedGames(profile);
	const referenceFlag = process.env.YIPDEN_GAME_REFERENCES;
	if (referenceFlag !== undefined && !['0', '1'].includes(referenceFlag)) {
		throw new Error('YIPDEN_GAME_REFERENCES must be 0 or 1.');
	}
	const includeReferences = options.surface === 'lab' && referenceFlag === '1';
	const paths: Partial<Record<GameId, string>> = {};
	const sourcePaths: Partial<Record<GameId, string>> = {};
	for (const id of includeReferences ? selected : []) {
		const path = fileURLToPath(
			new URL(`../../../tmp/games_handoffs/${referenceFiles[id]}`, import.meta.url)
		);
		if (!existsSync(path))
			throw new Error(`Missing local reference: ${path}. See docs/games-development.md.`);
		sourcePaths[id] = path;
		paths[id] = `/references/${id}.html`;
	}
	const emptyHost = fileURLToPath(new URL('../../game-host/src/empty.ts', import.meta.url));
	const resolvedRegistry = '\0virtual:yipden-games';
	const resolvedReferences = '\0virtual:yipden-game-references';
	function reference(id: GameId): string {
		const path = sourcePaths[id];
		if (!path) throw new Error(`Reference ${id} is not included in this build.`);
		return readFileSync(path, 'utf8');
	}
	function owner(moduleId: string): GameId | null {
		const normalized = moduleId.replaceAll('\\', '/');
		if (/\/packages\/(realm-core|realm-player)\//.test(normalized)) return 'realm';
		if (/\/packages\/stray\//.test(normalized)) return 'stray';
		return null;
	}
	return {
		name: 'yipden-game-boundary',
		config() {
			if (profile === 'thin')
				return { resolve: { alias: [{ find: /^@yipden\/game-host$/, replacement: emptyHost }] } };
			return undefined;
		},
		resolveId(id) {
			if (id === '@yipden/game-host' && profile === 'thin') return emptyHost;
			if (id === 'virtual:yipden-games') return resolvedRegistry;
			if (id === 'virtual:yipden-game-references') return resolvedReferences;
			return undefined;
		},
		load(id) {
			if (id === resolvedReferences) return `export const references = ${JSON.stringify(paths)};`;
			if (id !== resolvedRegistry) return undefined;
			const entries = selected.map((id) => {
				const { title, description, package: packageName } = descriptors[id];
				return `{id:${JSON.stringify(id)},title:${JSON.stringify(title)},description:${JSON.stringify(description)},load:()=>import(${JSON.stringify(packageName)})}`;
			});
			return `export const profile=${JSON.stringify(profile)};export const games=[${entries.join(',')}];`;
		},
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const id = selected.find((id) => paths[id] === request.url?.split('?')[0]);
				if (!id) return next();
				response.setHeader('Content-Type', 'text/html; charset=utf-8');
				response.setHeader('Cache-Control', 'no-store');
				response.end(reference(id));
			});
		},
		generateBundle(_output, bundle) {
			for (const moduleId of this.getModuleIds()) {
				if (
					profile === 'thin' &&
					/\/packages\/game-host\/src\/(session\.ts|GameSurface\.svelte|index\.ts)/.test(
						moduleId.replaceAll('\\', '/')
					)
				) {
					this.error(`The optional game host entered a thin build: ${moduleId}`);
				}
				const id = owner(moduleId);
				if (id && !selected.includes(id)) this.error(`${id} entered the ${profile} build graph.`);
			}
			const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
			const audit = chunks.map((chunk) => ({
				file: chunk.fileName,
				entry: chunk.isEntry,
				imports: chunk.imports,
				games: [...new Set(chunk.moduleIds.map(owner).filter((id): id is GameId => id !== null))]
			}));
			for (const chunk of audit) {
				for (const id of chunk.games) {
					if (!selected.includes(id))
						this.error(`${id} entered the ${profile} build in ${chunk.file}.`);
				}
			}
			const eager = new Set<string>();
			function visit(file: string) {
				if (eager.has(file)) return;
				eager.add(file);
				for (const dependency of audit.find((chunk) => chunk.file === file)?.imports ?? [])
					visit(dependency);
			}
			for (const chunk of audit.filter((chunk) => chunk.entry)) visit(chunk.file);
			for (const chunk of audit) {
				if (eager.has(chunk.file) && chunk.games.length)
					this.error(`Game code is eagerly loaded in ${chunk.file}.`);
			}
			this.emitFile({
				type: 'asset',
				fileName: 'game-build.json',
				source: JSON.stringify(
					{ surface: options.surface, profile, chunks: audit, references: Object.keys(paths) },
					null,
					2
				)
			});
			for (const id of Object.keys(paths) as GameId[]) {
				this.emitFile({ type: 'asset', fileName: `references/${id}.html`, source: reference(id) });
			}
		}
	};
}
