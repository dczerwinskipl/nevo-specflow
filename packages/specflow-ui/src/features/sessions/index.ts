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
export { SessionReadyEmptyState } from './managed/empty/SessionReadyEmptyState';
export { SessionNamingStatus } from './managed/naming/SessionNamingStatus';
// The start of a Session (new-session-ui-spec.md): the provider-neutral catalogue and choice model,
// the labelled agent fields shared with Create with an agent, and the start screen itself.
export { startCatalogueFromDemo } from './start/catalogue/fromDemoCatalogue';
export type {
  StartCatalogue,
  StartMode,
  StartModel,
  StartProvider,
} from './start/catalogue/startCatalogue';
export {
  initialAgentChoice,
  providerDefaultEffort,
  selectModel,
  selectProvider,
  type AgentChoice,
} from './start/choice/agentChoice';
export {
  chosenSessionName,
  initialSessionName,
  type SessionNameChoice,
} from './start/choice/sessionName';
export { AgentFields } from './start/fields/AgentFields';
export { ProviderChoice } from './start/fields/ProviderChoice';
export { SessionNameSection } from './start/fields/SessionNameSection';
export { newSessionReadiness } from './start/choice/newSessionReadiness';
export {
  applyModelEffort,
  modelEffortValue,
  modeValue,
  pickerModes,
  pickerProvider,
} from './start/choice/agentPickers';
export type { ContextSpecification } from './managed/context/sessionContextTypes';
export { SessionStartScreen, type SessionStartDefaults } from './start/screen/SessionStartScreen';
export type {
  SessionStartPending,
  SessionStartSource,
  StartCatalogueState,
} from './start/source/sessionStartSource';
export { useManagedStartSource } from './start/source/useManagedStartSource';
