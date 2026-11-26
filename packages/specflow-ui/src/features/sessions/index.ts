/** Public API of the sessions feature: the only module other features may import. */
export { useRequestSessionRecovery, useSessionReturn } from './SessionStateProvider';
export { SessionRecoveryNotice } from './recovery/SessionRecoveryNotice';
export { SessionProviderIcon } from './shared/SessionProviderIcon';
export { createManagedSessionsApi, type ManagedSessionsApi } from './managed/api';
export { SessionReadyEmptyState } from './managed/empty/SessionReadyEmptyState';
export { SessionNamingStatus } from './managed/naming/SessionNamingStatus';
// Starting a Session (full-session.md "Starting a Session"): the start screen, the provider-neutral
// catalogue and choice model, and the labelled agent fields that Create with an agent shares with
// the start form.
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
// A Specification's New Session (full-session.md "Starting a Session"): the project Runtime's start
// source, the association a start establishes, its gating and the refresh after this UI's own
// Session command.
export { startedAssociation, useManagedStartSource } from './start/source/useManagedStartSource';
export { startRouteRefusal, startSessionOffered } from './associations/startSessionGate';
export { invalidateSpecificationSessions } from './associations/queries';
// A step run by an agent (workflow-execution.md "Run with agent"): the start screen's agent tiles
// and the Composer's model picker, over the Runtime's provider catalogue.
export { AgentPicker } from './start/fields/AgentPicker';
export { ModelEffortPicker } from './managed/ModelEffortPicker';
export { startCatalogueFromProviders } from './start/catalogue/fromProviderDescriptors';
export {
  agentCanStart,
  startableAgents,
  type StartCatalogue,
} from './start/catalogue/startCatalogue';
// Which agents can start and how to fix those that cannot (the Session start screen's diagnosis),
// also shown by Create with an agent.
export { AgentAvailabilityNote } from './start/diagnostics/AgentAvailabilityNote';
export { AgentDiagnosisPanel } from './start/diagnostics/AgentDiagnosisPanel';
export { agentAvailability, recheckCanHelp } from './start/diagnostics/agentAvailability';
export { agentStatusText } from './start/diagnostics/agentStatus';
