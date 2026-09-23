/**
 * Theme: System, Light or Dark, chosen in You and applied as an attribute on the document.
 *
 * This is the one piece of state that deliberately lives in localStorage rather than behind the
 * `Store` interface. It has to be readable synchronously before first paint, which is what
 * static/theme-init.js does, and no async store can answer a question that is asked before the
 * first frame. Everything else a reader owns goes through `Store`.
 */

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'yipden:theme';

function read(): Theme {
	if (typeof localStorage === 'undefined') return 'system';
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'light' || stored === 'dark' ? stored : 'system';
	} catch {
		return 'system';
	}
}

class ThemeState {
	current = $state<Theme>('system');

	/** Read the stored choice once the app is running in a browser. */
	hydrate(): void {
		this.current = read();
		this.apply(this.current);
	}

	/**
	 * Change the theme with a crossfade rather than a hard flip.
	 *
	 * A View Transition is exactly right here: the whole document changes color at once, and
	 * every element crossfading together is both cheaper and calmer than any per element
	 * animation. Where the API is missing, the change simply happens.
	 */
	set(next: Theme): void {
		if (next === this.current) return;
		this.current = next;

		try {
			if (next === 'system') localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Storage refused. The theme still applies for this session.
		}

		const change = () => this.apply(next);
		if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			document.startViewTransition(change);
		} else {
			change();
		}
	}

	private apply(next: Theme): void {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = next;
	}
}

export const theme = new ThemeState();
