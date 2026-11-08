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
export { useAuthOwner } from './managed/useAuthOwner';
export { forgetStartedSessions } from './start/handoff/startedSession';
export { chosenSessionName, type SessionNameChoice } from './start/choice/sessionName';
export type { SentStart } from './start/handoff/startedSession';
export { AgentFields } from './start/fields/AgentFields';
export { ProviderChoice } from './start/fields/ProviderChoice';
export type { ContextFact, ContextSpecification } from './managed/context/sessionContextTypes';
export { SessionStartScreen } from './start/screen/SessionStartScreen';
export type { SessionStartSource } from './start/source/sessionStartSource';
// A Specification's New Session (session-association-ux §5): the project Runtime's start source, the
// association a start establishes, its gating and the refresh after this UI's own Session command.
export { startedAssociation, useManagedStartSource } from './start/source/useManagedStartSource';
export { startRouteRefusal, startSessionOffered } from './associations/startSessionGate';
export { invalidateSpecificationSessions } from './associations/queries';
