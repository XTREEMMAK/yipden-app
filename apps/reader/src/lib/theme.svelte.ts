/**
 * Appearance: a brightness theme and color skin, chosen in You and applied as attributes on the
 * document.
 *
 * This is the one piece of state that deliberately lives in localStorage rather than behind the
 * `Store` interface. It has to be readable synchronously before first paint, which is what
 * static/theme-init.js does, and no async store can answer a question that is asked before the
 * first frame. Everything else a reader owns goes through `Store`.
 */

export type Theme = 'system' | 'light' | 'dark';
export type Skin = 'original' | 'glass' | 'forest';

const THEME_STORAGE_KEY = 'yipden:theme';
const SKIN_STORAGE_KEY = 'yipden:skin';

function readTheme(): Theme {
	if (typeof localStorage === 'undefined') return 'system';
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		return stored === 'light' || stored === 'dark' ? stored : 'system';
	} catch {
		return 'system';
	}
}

function readSkin(): Skin {
	if (typeof localStorage === 'undefined') return 'original';
	try {
		const stored = localStorage.getItem(SKIN_STORAGE_KEY);
		return stored === 'glass' || stored === 'forest' ? stored : 'original';
	} catch {
		return 'original';
	}
}

class ThemeState {
	current = $state<Theme>('system');
	skin = $state<Skin>('original');

	/** Read the stored choice once the app is running in a browser. */
	hydrate(): void {
		this.current = readTheme();
		this.skin = readSkin();
		this.apply();
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
			if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
			else localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Storage refused. The theme still applies for this session.
		}

		this.transition(() => this.applyTheme(next));
	}

	setSkin(next: Skin): void {
		if (next === this.skin) return;
		this.skin = next;

		try {
			if (next === 'original') localStorage.removeItem(SKIN_STORAGE_KEY);
			else localStorage.setItem(SKIN_STORAGE_KEY, next);
		} catch {
			// Storage refused. The skin still applies for this session.
		}

		this.transition(() => this.applySkin(next));
	}

	private transition(change: () => void): void {
		if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			document.startViewTransition(change);
		} else {
			change();
		}
	}

	private apply(): void {
		this.applyTheme(this.current);
		this.applySkin(this.skin);
	}

	private applyTheme(next: Theme): void {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = next;
	}

	private applySkin(next: Skin): void {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.skin = next;
	}
}

export const theme = new ThemeState();
