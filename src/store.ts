import { MockAdapter } from './data/mockAdapter';
import { ChatwootAdapter } from './data/chatwootAdapter';
import type { DataAdapter, SimulatorHooks } from './data/adapter';

/**
 * Picks the data adapter at build time.
 *   default / GitHub Pages demo:  MockAdapter (in-memory, fake data)
 *   VITE_BACKEND=chatwoot:        ChatwootAdapter (self-hosted Chatwoot on the same origin,
 *                                 each agent signs in with their own Chatwoot account)
 */
export const BACKEND: 'mock' | 'chatwoot' = import.meta.env.VITE_BACKEND === 'chatwoot' ? 'chatwoot' : 'mock';
export const CHATWOOT_BASE: string = import.meta.env.VITE_CHATWOOT_BASE ?? '';

export const chatwoot: ChatwootAdapter | null = BACKEND === 'chatwoot'
  ? new ChatwootAdapter({ baseUrl: CHATWOOT_BASE, inboxName: import.meta.env.VITE_CHATWOOT_INBOX ?? 'VIA SMS (demo)' })
  : null;
export const mock: MockAdapter | null = chatwoot ? null : new MockAdapter();

export const adapter: DataAdapter = (chatwoot ?? mock)!;
/** Customer-phone simulator hooks (demo feature, works against both backends). */
export const simulator: SimulatorHooks = (chatwoot ?? mock)!;
