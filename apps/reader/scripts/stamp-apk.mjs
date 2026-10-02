/**
 * Give each debug APK its own name.
 *
 * A phone that downloads `app-debug.apk` from the same address every time is easily handed an
 * earlier download instead (a browser cache, or an older file of the same name in Downloads), and
 * nothing on the phone says which build it got. `android:apk` takes the next build number, shows
 * it in the app (About, after the commit), and copies the finished APK to `yipden-debug-<build>.apk`
 * beside the original, keeping only the last few so the folder does not grow without limit.
 */
import {
	copyFileSync,
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../android/app/build/outputs/apk/debug/', import.meta.url).pathname;
const source = join(dir, 'app-debug.apk');
const counter = new URL('../android/.debug-build-number', import.meta.url).pathname;
const KEEP = 3;

// `next` takes the next number before the build, so the app itself can show it (About); the
// plain call afterwards names the finished APK with that same number.
if (process.argv[2] === 'next') {
	const next = (existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0) + 1;
	writeFileSync(counter, `${next}\n`);
	console.log(next);
	process.exit(0);
}

if (!existsSync(source)) {
	console.error(`No APK at ${source}. Run the Gradle build first.`);
	process.exit(1);
}

const build = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0;

const name = `yipden-debug-${String(build).padStart(3, '0')}.apk`;
copyFileSync(source, join(dir, name));

const stamped = readdirSync(dir)
	.filter((file) => /^yipden-debug-.*\.apk$/.test(file))
	.sort();
for (const old of stamped.slice(0, -KEEP)) unlinkSync(join(dir, old));

console.log(`\nDebug build ${build}: ${name}`);
