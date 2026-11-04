/** Public API of the sessions feature: the only module other features may import. */
export { useRequestSessionRecovery, useSessionReturn } from './SessionStateProvider';
export { SessionRecoveryNotice } from './recovery/SessionRecoveryNotice';
export { SessionProviderIcon } from './shared/SessionProviderIcon';
export { createManagedSessionsApi, type ManagedSessionsApi } from './managed/api';
export { SessionReadyEmptyState } from './managed/empty/SessionReadyEmptyState';
export { SessionNamingStatus } from './managed/naming/SessionNamingStatus';
// Starting a Session (new-session-ui-spec.md): the start screen, the provider-neutral catalogue and
// choice model, and the labelled agent fields that Create with an agent shares with the start form.
export { startCatalogueFromDemo } from './start/catalogue/fromDemoCatalogue';
export {
  initialAgentChoice,
  providerDefaultEffort,
  selectProvider,
  type AgentChoice,
} from './start/choice/agentChoice';
export { AgentFields } from './start/fields/AgentFields';
export { ProviderChoice } from './start/fields/ProviderChoice';
export type { ContextSpecification } from './managed/context/sessionContextTypes';
export { SessionStartScreen } from './start/screen/SessionStartScreen';
export type { SessionStartSource } from './start/source/sessionStartSource';
