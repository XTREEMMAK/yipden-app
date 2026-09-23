/**
 * Toasts: one or two lines, above the dock, gone after 2.8 seconds.
 *
 * The app never calls `alert` or `confirm`. A confirmation happens inline, in the row it is
 * about, and a toast is only for telling a reader that something already happened.
 */

const LIFETIME_MS = 2800;

class ToastState {
	message = $state<string | null>(null);
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(message: string): void {
		this.message = message;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.message = null;
			this.timer = null;
		}, LIFETIME_MS);
	}

	dismiss(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.message = null;
	}
}

export const toast = new ToastState();
