import { MockAdapter } from './data/mockAdapter';
import type { DataAdapter } from './data/adapter';

// Swap this line for `new ChatwootAdapter({...})` when the backend exists.
export const mock = new MockAdapter();
export const adapter: DataAdapter = mock;
