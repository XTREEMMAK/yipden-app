import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const dir = resolve(process.argv[2] ?? 'build');
const expected = process.argv[3] ?? process.env.YIPDEN_GAMES ?? 'thin';
function files(folder) {
	return readdirSync(folder).flatMap((name) => {
		const path = resolve(folder, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}
const paths = files(dir);
const reports = paths
	.filter((path) => path.endsWith('/game-build.json'))
	.map((path) => JSON.parse(readFileSync(path, 'utf8')));
if (!reports.length) throw new Error(`No game build audit in ${dir}.`);
const selected = expected === 'thin' ? [] : expected === 'all' ? ['realm', 'stray'] : [expected];
for (const report of reports) {
	if (report.profile !== expected)
		throw new Error(`Expected ${expected}, found ${report.profile}.`);
	for (const chunk of report.chunks) {
		for (const id of chunk.games)
			if (!selected.includes(id)) throw new Error(`${id} leaked into ${expected}.`);
	}
	if (report.surface === 'reader' && report.references.length)
		throw new Error('Reference prototypes entered a reader build.');
}
if (expected === 'thin') {
	const leaks = paths.filter((path) => {
		if (relative(dir, path).startsWith('references/')) return true;
		if (!/\.(js|css|html)$/.test(path)) return false;
		const source = readFileSync(path, 'utf8');
		return [
			'realm-player-scaffold',
			'stray-player-scaffold',
			'BURST & COUNTER',
			'coyote-lottie',
			'fmodstudio'
		].some((marker) => source.includes(marker));
	});
	if (leaks.length)
		throw new Error(
			`Game content leaked into thin: ${leaks.map((path) => relative(dir, path)).join(', ')}`
		);
}
console.log(`${expected} ${reports[0].surface}: game graph and packaged web assets verified.`);
