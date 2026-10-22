import type { DemoSessionInput } from '@nevo/specflow-contracts/demo';
import { createKeyedStore, type KeyedStore } from '../../../shared/state/keyedStore';

/** The specification exists (atomic create); only the initial Session still has to be opened. */
export interface SessionRecovery {
  session: DemoSessionInput;
}
/** Pending initial Session allocation by `specId`. */
export type SessionRecoveryStore = KeyedStore<SessionRecovery>;
export const createSessionRecoveryStore = (): SessionRecoveryStore =>
  createKeyedStore<SessionRecovery>();
