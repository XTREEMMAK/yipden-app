import { execFileSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { gameBuild } from '@yipden/game-contracts/vite';
function commit() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
	return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
}
export default defineConfig({
	plugins: [gameBuild({ surface: 'lab', fallback: 'realm' }), sveltekit()],
	define: {
		__LAB_COMMIT__: JSON.stringify(commit()),
		__LAB_BUILD__: JSON.stringify(process.env.YIPDEN_GAME_BUILD ?? 'development')
	},
	server: { port: 5180, strictPort: true },
	preview: { port: 4188, strictPort: true }
});
