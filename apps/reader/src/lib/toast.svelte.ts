/**
 * Toasts: one or two lines, above the dock, gone after 2.8 seconds.
 *
 * The app never calls `alert` or `confirm`. A confirmation happens inline, in the row it is
 * about, and a toast is only for telling a reader that something already happened. It can carry
 * one action, which takes them to it ("View"); a toast with an action stays long enough to reach.
 */

const LIFETIME_MS = 2800;
const WITH_ACTION_MS = 6000;

export interface ToastAction {
	label: string;
	run: () => void;
}

class ToastState {
	message = $state<string | null>(null);
	action = $state<ToastAction | null>(null);
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(message: string, action?: ToastAction): void {
		this.message = message;
		this.action = action ?? null;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(
			() => {
				this.message = null;
				this.action = null;
				this.timer = null;
			},
			action ? WITH_ACTION_MS : LIFETIME_MS
		);
	}

	/** The action's button: do it, and the toast has done its job. */
	act(): void {
		const action = this.action;
		this.dismiss();
		action?.run();
	}

	dismiss(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.message = null;
		this.action = null;
	}
}

export const toast = new ToastState();
