import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const profile = args.find((arg) => arg.startsWith('--profile='))?.slice(10) ?? 'realm';
const destination = args.find((arg) => arg.startsWith('--dir='))?.slice(6);
if (
	!destination ||
	!['thin', 'realm', 'stray', 'all'].includes(profile) ||
	args.some((arg) => !arg.startsWith('--profile=') && !arg.startsWith('--dir='))
)
	throw new Error('Usage: android:publish --profile=realm --dir=/path/to/downloads/games');
const sourceDir = fileURLToPath(new URL('../../apps/games-lab/dist/apks/', import.meta.url));
const record = JSON.parse(readFileSync(join(sourceDir, `latest-${profile}.json`), 'utf8'));
if (basename(record.filename) !== record.filename || !record.filename.endsWith('.apk'))
	throw new Error('Invalid artifact filename.');
const source = join(sourceDir, record.filename);
const bytes = readFileSync(source);
if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
	throw new Error('APK digest does not match its build metadata.');
const dir = resolve(destination);
mkdirSync(dir, { recursive: true });
const apk = join(dir, record.filename);
if (
	existsSync(apk) &&
	createHash('sha256').update(readFileSync(apk)).digest('hex') !== record.sha256
)
	throw new Error('Refusing to replace an artifact with different bytes.');
const temporary = join(dir, `.upload-${randomBytes(6).toString('hex')}`);
copyFileSync(source, temporary);
renameSync(temporary, apk);
writeFileSync(apk.replace(/\.apk$/, '.json'), JSON.stringify(record, null, 2) + '\n');
const latest = join(dir, `latest-${profile}.json`);
writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n');
renameSync(temporary, latest);
console.log(`Published ${apk}\nSHA-256 ${record.sha256}`);
