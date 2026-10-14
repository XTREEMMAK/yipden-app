/**
 * `pnpm directory:check`: the published directory is clean, or this fails. Run by `pnpm test`, so
 * by CI on every push. Offline: it reads only the files in this repository.
 *
 * - every entry of people.json passes validation untouched (nothing dropped, nothing repaired);
 * - optouts.json holds only well-formed hashes, once each;
 * - no listed person matches an opt-out, under any form of their addresses and accounts;
 * - no person is listed twice (two entries sharing an identity);
 * - nothing from the test seed is in the published list.
 */
import {
	hashesOf,
	personFromDirectoryEntry,
	validateDirectory,
	validateOptOuts
} from '../../packages/directory/src/index.ts';
import { paths, readJson } from './files.mjs';

const problems = [];
const origin = { source: 'yipden', sourceName: 'YipDen', listing: 'curated' };

const raw = readJson(paths.people);
const { document, dropped, repaired } = validateDirectory(raw);
for (const entry of dropped)
	problems.push(`people.json entry ${entry.index} (${entry.id}): ${entry.reason}`);
for (const entry of repaired)
	problems.push(`people.json entry ${entry.index} (${entry.id}): ${entry.reason}`);

const rawOptOuts = readJson(paths.optOuts);
const optOuts = validateOptOuts(rawOptOuts);
if (!Array.isArray(rawOptOuts.hashes) || optOuts.hashes.length !== rawOptOuts.hashes.length) {
	problems.push('optouts.json: every hash must be 64 lowercase hex characters');
}
if (new Set(optOuts.hashes).size !== optOuts.hashes.length) {
	problems.push('optouts.json: a hash is listed twice');
}
const optedOut = new Set(optOuts.hashes);

const seed = validateDirectory(readJson(paths.seedPeople)).document.entries;
const seedIds = new Set(seed.map((entry) => entry.id));
const seedIdentities = new Set(
	seed.flatMap((entry) => personFromDirectoryEntry(entry, origin).identities)
);

const owner = new Map();
for (const entry of document.entries) {
	const person = personFromDirectoryEntry(entry, origin);
	if ((await hashesOf(person)).some((hash) => optedOut.has(hash))) {
		problems.push(`${entry.id}: matches an opt-out; remove it with pnpm directory:optout`);
	}
	if (seedIds.has(entry.id) || person.identities.some((id) => seedIdentities.has(id))) {
		problems.push(`${entry.id}: is in the test seed, which must never be published`);
	}
	for (const identity of person.identities) {
		const other = owner.get(identity);
		if (other && other !== entry.id)
			problems.push(`${entry.id}: the same person as ${other} (${identity})`);
		owner.set(identity, entry.id);
	}
}

if (problems.length) {
	console.error('directory:check failed:');
	for (const problem of new Set(problems)) console.error(`  - ${problem}`);
	process.exit(1);
}
console.log(
	`directory:check: ${document.entries.length} listed, ${optOuts.hashes.length} opted out, all clean.`
);
