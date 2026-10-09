import type { GameMountOptions, GameSession } from '@yipden/game-contracts';
import './player.css';

/** Day policy and site eligibility remain undecided; no daily hunt runs outside explicit play. */
export async function mount({ target, signal }: GameMountOptions): Promise<GameSession> {
	signal.throwIfAborted();
	const panel = document.createElement('section');
	panel.className = 'stray-player-scaffold';
	const heading = document.createElement('h2');
	heading.textContent = 'The Stray player scaffold';
	const description = document.createElement('p');
	description.textContent =
		'The hunt is not migrated yet. Its handoff must settle activation, day/timezone policy and eligible destinations. Realm is the first development focus.';
	const status = document.createElement('p');
	status.textContent = 'Session active';
	status.setAttribute('role', 'status');
	panel.append(heading, description, status);
	target.appendChild(panel);
	let disposed = false;
	const destroy = () => {
		if (disposed) return;
		disposed = true;
		signal.removeEventListener('abort', destroy);
		panel.remove();
	};
	signal.addEventListener('abort', destroy, { once: true });
	return {
		pause: () => {
			if (!disposed) status.textContent = 'Session paused';
		},
		resume: () => {
			if (!disposed) status.textContent = 'Session active';
		},
		destroy
	};
}
