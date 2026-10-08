#!/usr/bin/env node
/**
 * Keeps Surf's seed out of a release.
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

// Something only the seed says: a site it lists, and the folder its media lived in.
const marks = ['strawberryreverie.neocities.org', '/sites/medjed.', '/sites/deltaring.'];
const leaks = files(build).filter((path) => {
	if (!/\.(js|json|html|css)$/.test(path)) return false;
	const text = readFileSync(path, 'utf8');
	return marks.some((mark) => text.includes(mark));
});

if (existsSync(join(build, 'sites')) || leaks.length) {
	console.error("Surf's seed is in this release build:");
	for (const path of leaks) console.error(`  ${path}`);
	process.exit(1);
}
console.log('Surf ships empty: no seed list, no posters or clips in the build.');
