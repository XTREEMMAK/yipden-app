import type { GameMountOptions, GameSession } from '@yipden/game-contracts';
import { parseLayout } from '@yipden/realm-core';
import './player.css';

/** Lifecycle scaffold only. The reference prototype remains a separate lab-only surface. */
export async function mount({ target, signal }: GameMountOptions): Promise<GameSession> {
	signal.throwIfAborted();
	const layout = parseLayout({
		version: 3,
		realm: 0,
		board: { width: 960, height: 3200 },
		regions: []
	});
	const panel = document.createElement('section');
	panel.className = 'realm-player-scaffold';
	const heading = document.createElement('h2');
	heading.textContent = 'Realm player scaffold';
	const description = document.createElement('p');
	description.textContent = `The production player is not migrated yet. The map boundary accepts the ${layout.board.width} × ${layout.board.height} prototype board. Open the reference in Games Lab to play the supplied prototype.`;
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
