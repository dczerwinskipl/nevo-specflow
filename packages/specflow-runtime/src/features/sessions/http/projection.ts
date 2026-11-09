import type { FastifyRequest } from 'fastify';
import {
  type SessionInfo,
  type SessionSnapshot,
  type SessionChange,
  type LiveProjection,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import type { SessionListSummary, StoredListSummary } from '../persistence/protocol';
import { resolveSessionPermissions, type SessionScopeIdentity } from '../scope';

type ProviderFacts = Pick<SessionInfo, 'providerId' | 'providerModeId' | 'mode'>;

/** The Session's provider, and its provider mode when it has one, can run a Turn now. */
function providerAvailable(
  session: ProviderFacts,
  provider: ProviderDescriptor | undefined,
): boolean {
  const modeAvailable =
    !session.providerModeId ||
    provider?.providerModes?.some(
      (mode) =>
        mode.modeId === session.providerModeId &&
        mode.mode === session.mode &&
        mode.readiness === 'ready' &&
        mode.authorized !== false,
    ) === true;

  return provider?.readiness === 'ready' && modeAvailable;
}

/**
 * Effective readiness: the stored readiness, unless the provider cannot run a Turn and none is
 * active, which reads `authenticationRequired` or `unavailable`. Every Session read applies it.
 */
export function effectiveReadiness(
  session: ProviderFacts & Pick<SessionInfo, 'readiness'>,
  activeTurn: boolean,
  provider: ProviderDescriptor | undefined,
): SessionInfo['readiness'] {
  if (providerAvailable(session, provider) || activeTurn) {
    return session.readiness;
  }

  return provider?.readiness === 'authenticationRequired'
    ? 'authenticationRequired'
    : 'unavailable';
}

/**
 * The presentational provider and model titles of the Runtime's catalogue, each absent when it is
 * not listed. Every Session read (list rows, the snapshot, change projections) resolves them here,
 * so a caller with `session.view` alone never needs the provider catalogue to name the executor.
 */
function catalogueTitles(
  modelId: string | undefined,
  provider: ProviderDescriptor | undefined,
): { providerTitle?: string; modelTitle?: string } {
  const modelTitle =
    modelId === undefined
      ? undefined
      : provider?.models.find((model) => model.modelId === modelId)?.title;

  return {
    ...(provider ? { providerTitle: provider.title } : {}),
    ...(modelTitle ? { modelTitle } : {}),
  };
}

/**
 * A list row of a stored summary: the provider and model titles of the Runtime's catalogue (absent
 * when not listed) and the effective readiness. The mode facts stay internal.
 */
export function listedSession(
  summary: StoredListSummary,
  providerFor: (providerId: string) => ProviderDescriptor | undefined,
): SessionListSummary {
  const { mode: _mode, providerModeId: _providerModeId, ...row } = summary;
  const provider = providerFor(summary.providerId);

  return {
    ...row,
    ...catalogueTitles(summary.modelId, provider),
    readiness: effectiveReadiness(summary, summary.activeTurn !== undefined, provider),
  };
}

/** `identity` is the store-derived identity of `s`; it decides the scope of every capability. */
export function effective(
  s: SessionSnapshot,
  request: FastifyRequest,
  providerFor: (providerId: string) => ProviderDescriptor | undefined,
  identity: SessionScopeIdentity,
): SessionSnapshot {
  const provider = providerFor(s.session.providerId);
  const available = providerAvailable(s.session, provider);
  const permissions = resolveSessionPermissions(request.authz, identity);
  s.session.capabilities.view = permissions.view;
  s.session.capabilities.manage = permissions.manage;
  s.session.capabilities.questions = provider?.capabilities.questions === true;
  s.session.capabilities.permissions = provider?.capabilities.permissions === true;
  s.session.capabilities.executeWrite = permissions['execute-write'];
  s.session.capabilities.delete = permissions.delete;
  s.session.capabilities.start =
    permissions.manage &&
    !s.session.archivedAt &&
    available &&
    s.session.readiness === 'ready' &&
    !s.activeTurn &&
    (s.session.mode !== 'workspace-write' || permissions['execute-write']);
  s.session.capabilities.cancel =
    permissions.manage && !!s.activeTurn && s.activeTurn.state !== 'unknown';
  s.session.readiness = effectiveReadiness(s.session, !!s.activeTurn, provider);
  // Resolved on every read, never kept from an earlier one: a title no longer listed drops.
  delete s.session.providerTitle;
  delete s.session.modelTitle;
  Object.assign(s.session, catalogueTitles(s.session.modelId, provider));

  return s;
}

export function effectiveEvent(
  event: SessionChange,
  request: FastifyRequest,
  available: (providerId: string) => ProviderDescriptor | undefined,
  identity: SessionScopeIdentity,
): SessionChange {
  if ('projection' in event.changes && event.changes.projection) {
    const p: LiveProjection = event.changes.projection;
    effective(
      {
        session: p.session,
        revision: 0,
        eventSeq: event.eventSeq,
        entries: [],
        history: { hasOlder: false },
        ...(p.activeTurn ? { activeTurn: p.activeTurn } : {}),
        ...(p.currentActivity ? { currentActivity: p.currentActivity } : {}),
        ...(p.interaction ? { interaction: p.interaction } : {}),
      },
      request,
      available,
      identity,
    );
  }

  return event;
}
