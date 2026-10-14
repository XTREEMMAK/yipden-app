/**
 * `pnpm directory:optout <address, handle or --id entry-id>`: someone asked not to be listed.
 *
 * Every identity we know for them is hashed into optouts.json (their site in every spelling,
 * feeds, accounts), and their entry leaves people.json. Run by hand, or by the directory-optout
 * workflow once a request has been approved (moderated: DECISIONS.md, 2026-10-14). It prints how
 * many entries it removed and hashes it added, never who.
 */
import {
	hashIdentity,
	identitiesOfInput,
	personFromDirectoryEntry,
	validateOptOuts
} from '../../packages/directory/src/index.ts';
import { paths, readJson, writeJson } from './files.mjs';

const args = process.argv.slice(2);
const byId = args[0] === '--id' ? args[1] : null;
const input = byId ? null : args.join(' ').trim();
if (!byId && !input) {
	console.error('Usage: pnpm directory:optout <address or handle> | --id <entry id>');
	process.exit(2);
}

const origin = { source: 'yipden', sourceName: 'YipDen', listing: 'curated' };
const people = readJson(paths.people);
const optOuts = readJson(paths.optOuts);

const asked = new Set(input ? identitiesOfInput(input) : []);
if (input && !asked.size) {
	console.error('That is not an address or a handle this can read. Try the full https:// address.');
	process.exit(2);
}

const matched = people.entries.filter((entry) => {
	if (byId) return entry.id === byId;
	const person = personFromDirectoryEntry({ feeds: [], tags: [], ...entry }, origin);
	return person.identities.some((identity) => asked.has(identity));
});
if (byId && !matched.length) {
	console.error(`No entry with the id ${byId}.`);
	process.exit(1);
}

const identities = new Set(asked);
for (const entry of matched) {
	for (const id of personFromDirectoryEntry({ feeds: [], tags: [], ...entry }, origin).identities) {
		identities.add(id);
	}
}

const before = new Set(validateOptOuts(optOuts).hashes);
const hashes = new Set(before);
for (const identity of identities) hashes.add(await hashIdentity(identity));

const removed = new Set(matched.map((entry) => entry.id));
writeJson(paths.people, {
	...people,
	generated_at: new Date().toISOString(),
	entries: people.entries.filter((entry) => !removed.has(entry.id))
});
writeJson(paths.optOuts, { ...optOuts, hashes: [...hashes].sort() });
console.log(
	`Removed ${removed.size} entr${removed.size === 1 ? 'y' : 'ies'}; added ${hashes.size - before.size} opt-out hash(es).`
);
