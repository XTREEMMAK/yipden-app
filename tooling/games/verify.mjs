import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
function run(args, cwd, env) {
	const result = spawnSync('pnpm', args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const profile of ['thin', 'realm', 'stray', 'all']) {
	const env = { YIPDEN_GAMES: profile, YIPDEN_GAME_REFERENCES: '0' };
	const lab = resolve(root, 'apps/games-lab');
	run(['exec', 'playwright', 'test'], lab, env);
	const result = spawnSync(
		'node',
		[resolve(root, 'tooling/games/check-build.mjs'), resolve(lab, 'build'), profile],
		{ cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' }
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const profile of ['thin', 'all']) {
	const env = { YIPDEN_GAMES: profile, YIPDEN_GAME_REFERENCES: '0', E2E_PORT: '4181', CI: '1' };
	const reader = resolve(root, 'apps/reader');
	run(['exec', 'playwright', 'test', 'e2e/games.spec.ts', 'e2e/shell.spec.ts'], reader, env);
	const result = spawnSync(
		'node',
		[resolve(root, 'tooling/games/check-build.mjs'), resolve(reader, 'build'), profile],
		{ cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' }
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
}
