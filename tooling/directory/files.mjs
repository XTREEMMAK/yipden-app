import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The directory's files, from the repository root. */
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const paths = {
	people: `${root}directory/people.json`,
	optOuts: `${root}directory/optouts.json`,
	seedPeople: `${root}directory/seed/people.test.json`,
	seedOptOuts: `${root}directory/seed/optouts.test.json`
};

export function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

/** Two-space JSON with a final newline, the way Prettier leaves it. */
export function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, '\t').replace(/\t/g, '  ')}\n`);
}
