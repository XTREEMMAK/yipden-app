import { afterEach, describe, expect, it, vi } from 'vitest';
import { tap } from './tap.js';

function pointer(type: string, x = 10, y = 10): PointerEvent {
	// jsdom has no PointerEvent constructor; a MouseEvent with the fields `tap` reads stands in.
	const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
	Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
	return event as PointerEvent;
}

describe('tap', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.useRealTimers();
	});

	function setup() {
		const button = document.createElement('button');
		const other = document.createElement('button');
		document.body.append(button, other);
		const onTap = vi.fn();
		const onOther = vi.fn();
		other.addEventListener('click', onOther);
		const action = tap(button, onTap);
		return { button, other, onTap, onOther, action };
	}

	it('answers a press and a release that has not travelled, wherever the release lands', () => {
		const { button, other, onTap } = setup();
		button.dispatchEvent(pointer('pointerdown'));
		// The button has slid away: the release is on something else.
		other.dispatchEvent(pointer('pointerup', 12, 11));
		expect(onTap).toHaveBeenCalledTimes(1);
	});

	it('swallows the click that follows, so it cannot reach what the tap just opened', () => {
		const { button, other, onTap, onOther } = setup();
		button.dispatchEvent(pointer('pointerdown'));
		button.dispatchEvent(pointer('pointerup'));
		// The menu the tap opened is now under the finger, and the browser's click lands on it.
		other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(onOther).not.toHaveBeenCalled();
		expect(onTap).toHaveBeenCalledTimes(1);
	});

	it('lets a later click through once no click followed the tap', () => {
		vi.useFakeTimers();
		const { button, other, onOther } = setup();
		button.dispatchEvent(pointer('pointerdown'));
		button.dispatchEvent(pointer('pointerup'));
		vi.advanceTimersByTime(500);
		other.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onOther).toHaveBeenCalledTimes(1);
	});

	it('does not answer a release that has travelled', () => {
		const { button, onTap } = setup();
		button.dispatchEvent(pointer('pointerdown'));
		button.dispatchEvent(pointer('pointerup', 60, 10));
		expect(onTap).not.toHaveBeenCalled();
	});

	it('still answers a plain click with no tap behind it, as the keyboard makes', () => {
		const { button, onTap } = setup();
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onTap).toHaveBeenCalledTimes(1);
	});
});
