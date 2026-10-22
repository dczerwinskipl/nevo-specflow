import { createKeyedStore, type KeyedStore } from '../../shared/state/keyedStore';

/** The Session a document was opened from, by `specId`, so Documents can return to it. */
export type SessionReturnStore = KeyedStore<string>;
export const createSessionReturnStore = (): SessionReturnStore => createKeyedStore<string>();
