import { discoverFeeds, type DiscoverOptions, type DiscoveryResult } from '@yipden/feeds';
import { httpFetch } from './platform/http.js';

/** A whole discovery run gets one budget; its individual probes must not multiply that wait. */
export const DISCOVERY_DEADLINE_MS = 15_000;

export class DiscoveryTimeoutError extends Error {
	override name = 'DiscoveryTimeoutError';

	constructor() {
		super('feed discovery took too long');
	}
}

export interface DeadlineDiscoveryOptions extends DiscoverOptions {
	/** Total time for the complete search, including robots, profiles, and fallback probes. */
	deadlineMs?: number;
}

export async function discoverWithDeadline(
	input: string,
	options: DeadlineDiscoveryOptions = {}
): Promise<DiscoveryResult> {
	const {
		deadlineMs = DISCOVERY_DEADLINE_MS,
		signal: callerSignal,
		fetch = httpFetch,
		...discoveryOptions
	} = options;
	const controller = new AbortController();
	let timedOut = false;
	const abortFromCaller = () => controller.abort();
	if (callerSignal?.aborted) abortFromCaller();
	else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, deadlineMs);

	try {
		return await discoverFeeds(input, {
			...discoveryOptions,
			fetch,
			signal: controller.signal
		});
	} catch (cause) {
		if (timedOut) throw new DiscoveryTimeoutError();
		throw cause;
	} finally {
		clearTimeout(timer);
		callerSignal?.removeEventListener('abort', abortFromCaller);
	}
}
