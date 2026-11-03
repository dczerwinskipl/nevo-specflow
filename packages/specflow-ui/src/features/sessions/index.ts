/** Public API of the sessions feature: the only module other features may import. */
export { useRequestSessionRecovery, useSessionReturn } from './SessionStateProvider';
export { SessionRecoveryNotice } from './recovery/SessionRecoveryNotice';
export { SessionProviderIcon } from './shared/SessionProviderIcon';
export { createManagedSessionsApi, type ManagedSessionsApi } from './managed/api';
// The Composer's own agent pickers, reused by the Session start screens (one presentation of the
// first Turn's model, effort and work mode — see `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`).
export {
  ModelEffortPicker,
  type ModelEffortProvider,
  type ModelEffortValue,
} from './managed/ModelEffortPicker';
export { ComposerModePicker } from './managed/ComposerPresetPicker';
export type { WorkModeOption } from './managed/workModes';
export { SessionNamingStatus } from './managed/naming/SessionNamingStatus';
