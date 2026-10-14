/**
 * Lets Node run the workspace's TypeScript packages directly (Node 24 strips types itself): the
 * packages import each other's files as `.js`, the way TypeScript expects, and this points those
 * at the `.ts` file beside them when there is no `.js` one. No dependency, no build step.
 *
 *   node --import ./tooling/directory/ts-hook.mjs tooling/directory/check.mjs
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.endsWith('.js') && (specifier.startsWith('.') || specifier.startsWith('/'))) {
			const ts = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
			const js = new URL(specifier, context.parentURL);
			if (!existsSync(fileURLToPath(js)) && existsSync(fileURLToPath(ts))) {
				return nextResolve(ts.href, context);
			}
		}
		return nextResolve(specifier, context);
	}
});
