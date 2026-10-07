/**
 * Debug builds only: what the car and the lock screen asked of the player, and what came of it.
 *
 * Written for one question (2026-10-07): a Tesla's Pause works and its Play does not, and nothing
 * on the desk can say why. Each line is one action as it arrived, whether the page was visible,
 * what the track was, and any refusal of `play()` with the browser's own reason, which the player
 * otherwise swallows. Kept across launches, since Android may kill the app between the drive and
 * the reader opening Settings. A release build has none of it: `mediaLog` is null there.
 */

const KEY = 'yipden:diag:mediaLog';
const LIMIT = 40;

function read(): string[] {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(saved) ? saved.filter((line) => typeof line === 'string') : [];
	} catch {
		return [];
	}
}

class MediaLog {
	lines = $state<string[]>(read());

	add(text: string): void {
		const stamp = new Date().toLocaleTimeString([], { hour12: false });
		const visible = typeof document === 'undefined' ? '?' : document.visibilityState;
		this.lines = [...this.lines, `${stamp} [${visible}] ${text}`].slice(-LIMIT);
		try {
			localStorage.setItem(KEY, JSON.stringify(this.lines));
		} catch {
			// No storage: the log still holds for this session.
		}
	}

	clear(): void {
		this.lines = [];
		try {
			localStorage.removeItem(KEY);
		} catch {
			// Nothing to clear.
		}
	}
}

export const mediaLog: MediaLog | null = __YIPDEN_DEBUG__ ? new MediaLog() : null;
