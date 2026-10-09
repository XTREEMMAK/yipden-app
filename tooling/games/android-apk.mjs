import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	closeSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
	readdirSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const app = join(root, 'apps/games-lab');
const args = process.argv.slice(2);
const profile =
	args.find((arg) => arg.startsWith('--profile='))?.slice(10) ??
	process.env.YIPDEN_GAMES ??
	'realm';
if (!['thin', 'realm', 'stray', 'all'].includes(profile))
	throw new Error('Use --profile=thin|realm|stray|all.');
if (args.some((arg) => !arg.startsWith('--profile=') && arg !== '--references'))
	throw new Error('Unknown APK build argument.');
if (process.env.CAP_LIVE_RELOAD_URL)
	throw new Error('Packaged test APKs must not use CAP_LIVE_RELOAD_URL.');
const withReferences = args.includes('--references');
if (withReferences && profile === 'thin')
	throw new Error('Thin APKs cannot include prototype references.');
function run(command, args, cwd = app, env = {}) {
	const result = spawnSync(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
function git(args) {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error('Unable to identify the build revision.');
	return result.stdout.trim();
}
const commit = git(['rev-parse', '--short', 'HEAD']);
const dirty = Boolean(git(['status', '--porcelain']));
const build =
	new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z') +
	'-' +
	randomBytes(3).toString('hex');
const android = join(app, 'android');
const lock = join(android, '.game-build-lock');
const fd = openSync(lock, 'wx');
try {
	const env = {
		YIPDEN_GAMES: profile,
		YIPDEN_GAME_REFERENCES: withReferences ? '1' : '0',
		YIPDEN_GAME_BUILD: build
	};
	run('pnpm', ['build'], app, env);
	run('node', [join(root, 'tooling/games/check-build.mjs'), join(app, 'build'), profile], app, env);
	run('pnpm', ['exec', 'cap', 'sync', 'android'], app, env);
	run(
		'./gradlew',
		[`assemble${profile[0].toUpperCase() + profile.slice(1)}Debug`, '--console=plain'],
		android,
		env
	);
	const output = join(android, 'app/build/outputs/apk', profile, 'debug');
	const metadata = JSON.parse(readFileSync(join(output, 'output-metadata.json'), 'utf8'));
	if (metadata.applicationId !== `com.yipden.gamelab.${profile}`)
		throw new Error('APK application id does not match the game profile.');
	const source = join(output, metadata.elements[0].outputFile);
	run('python3', [join(root, 'tooling/games/check-apk.py'), source, profile]);
	const apkBytes = readFileSync(source);
	const sha256 = createHash('sha256').update(apkBytes).digest('hex');
	const filename = `yipden-games-${profile}-${commit}${dirty ? '-dirty' : ''}-${build}.apk`;
	const dir = join(app, 'dist/apks');
	mkdirSync(dir, { recursive: true });
	const apk = join(dir, filename);
	copyFileSync(source, apk);
	const auditPaths = [];
	function scan(folder) {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) scan(path);
			else if (entry.name === 'game-build.json') auditPaths.push(path);
		}
	}
	scan(join(app, 'build'));
	const record = {
		filename,
		sha256,
		bytes: apkBytes.length,
		profile,
		applicationId: metadata.applicationId,
		commit,
		branch: git(['branch', '--show-current']),
		dirty,
		build,
		references: withReferences,
		audits: auditPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')))
	};
	writeFileSync(apk.replace(/\.apk$/, '.json'), JSON.stringify(record, null, 2) + '\n');
	writeFileSync(join(dir, `latest-${profile}.json`), JSON.stringify(record, null, 2) + '\n');
	console.log(`\n${apk}\nSHA-256 ${sha256}`);
} finally {
	closeSync(fd);
	if (existsSync(lock)) unlinkSync(lock);
}
