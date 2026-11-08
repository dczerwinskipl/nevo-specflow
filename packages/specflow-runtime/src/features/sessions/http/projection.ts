import type { FastifyRequest } from 'fastify';
import {
  type SessionSnapshot,
  type SessionChange,
  type LiveProjection,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { resolveSessionPermissions, type SessionScopeIdentity } from '../scope';

/** `identity` is the store-derived identity of `s`; it decides the scope of every capability. */
export function effective(
  s: SessionSnapshot,
  request: FastifyRequest,
  providerFor: (providerId: string) => ProviderDescriptor | undefined,
  identity: SessionScopeIdentity,
): SessionSnapshot {
  const provider = providerFor(s.session.providerId);
  const modeAvailable =
    !s.session.providerModeId ||
    provider?.providerModes?.some(
      (mode) =>
        mode.modeId === s.session.providerModeId &&
        mode.mode === s.session.mode &&
        mode.readiness === 'ready' &&
        mode.authorized !== false,
    ) === true;
  const available = provider?.readiness === 'ready' && modeAvailable;
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
  if (!available && !s.activeTurn) {
    s.session.readiness =
      provider?.readiness === 'authenticationRequired' ? 'authenticationRequired' : 'unavailable';
  }

  return s;
}

export function effectiveEvent(
  event: SessionChange,
  request: FastifyRequest,
  available: (providerId: string) => ProviderDescriptor | undefined,
  identity: SessionScopeIdentity,
): SessionChange {
  if (event.kind === 'session') {
    const session = event.changes.session;
    effective(
      { session, revision: 0, eventSeq: event.eventSeq, entries: [], history: { hasOlder: false } },
      request,
      available,
      identity,
    );
  } else if ('projection' in event.changes && event.changes.projection) {
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
