#!/usr/bin/env node
/**
 * Keeps debug seeds out of a release: Surf's seed, and the creator directory's test seed.
 *
 * Surf's bundled sites, posters and clips were only ever a trial (2026-10-08). A plain build, which
 * is what a release is made from, drops the posters and clips from the built app, then fails if the
 * list or any of its media is still in it. A debug build (`VITE_YIPDEN_DEBUG=1`) keeps all of it, so
 * Surf can still be tried and the end to end suite has something to look at.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.VITE_YIPDEN_DEBUG === '1') process.exit(0);

const build = new URL('../build/', import.meta.url).pathname;
rmSync(join(build, 'sites'), { recursive: true, force: true });

/** Every file under a folder, as paths. */
function files(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

// Something only a debug seed says. Surf's: a site it lists, and the folder its media lived in.
// The creator directory's test seed (directory/seed): its people's pages and channel, and the
// example who opted out. They are listed for real only by being published in people.json, which
// the app fetches; nothing of the test seed may ever be in a release (DECISIONS.md, 2026-10-14).
const marks = [
	'strawberryreverie.neocities.org',
	'/sites/medjed.',
	'/sites/deltaring.',
	'jerichords.carrd.co',
	'UCY_lC-yhnqr9M3Umye24TbA',
	'opted-out.example.com'
];
const leaks = files(build).filter((path) => {
	if (!/\.(js|json|html|css)$/.test(path)) return false;
	const text = readFileSync(path, 'utf8');
	return marks.some((mark) => text.includes(mark));
});

if (existsSync(join(build, 'sites')) || leaks.length) {
	console.error('A debug seed (Surf or the directory test seed) is in this release build:');
	for (const path of leaks) console.error(`  ${path}`);
	process.exit(1);
}
console.log(
	'No debug seeds in the build: Surf ships empty, and the directory test seed is absent.'
);
