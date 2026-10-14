import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { gameProfile, selectedGames } from '@yipden/game-contracts/profile';
import type { GameId, GameProfile } from './index.js';

const descriptors = {
	stray: {
		title: 'The Stray',
		description: 'A small-web pup hunt. Production player scaffold.',
		package: '@yipden/stray'
	}
};

/** A different module is resolved per build; thin never traverses game imports. */
export function gameBuild(options: { fallback: GameProfile }): Plugin {
	const profile = gameProfile(process.env.YIPDEN_GAMES, options.fallback);
	const selected = selectedGames(profile);
	const emptyHost = fileURLToPath(new URL('../../game-host/src/empty.ts', import.meta.url));
	const resolvedRegistry = '\0virtual:yipden-games';
	function owner(moduleId: string): GameId | null {
		const normalized = moduleId.replaceAll('\\', '/');
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
			return undefined;
		},
		load(id) {
			if (id !== resolvedRegistry) return undefined;
			const entries = selected.map((id) => {
				const { title, description, package: packageName } = descriptors[id];
				return `{id:${JSON.stringify(id)},title:${JSON.stringify(title)},description:${JSON.stringify(description)},load:()=>import(${JSON.stringify(packageName)})}`;
			});
			return `export const profile=${JSON.stringify(profile)};export const games=[${entries.join(',')}];`;
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
				source: JSON.stringify({ profile, chunks: audit }, null, 2)
			});
		}
	};
}
