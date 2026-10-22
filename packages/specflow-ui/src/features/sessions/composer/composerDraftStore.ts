import { createKeyedStore, type KeyedStore } from '../../../shared/state/keyedStore';

/** Visit-scoped unsent Session message per `specId:sessionId`. */
export const composerDraftKey = (specId: string, sessionId: string) => `${specId}:${sessionId}`;
export type ComposerDraftStore = KeyedStore<string>;
export const createComposerDraftStore = (): ComposerDraftStore => createKeyedStore<string>();
