import type { FastifyRequest } from 'fastify';
import {
  SessionCapabilities,
  type SessionSnapshot,
  type SessionChange,
  type LiveProjection,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';

export function effective(
  s: SessionSnapshot,
  request: FastifyRequest,
  providerFor: (providerId: string) => ProviderDescriptor | undefined,
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
  const permissions = request.authz.resolveCapabilities({
    resource: SessionCapabilities,
    scope: { projectId: s.session.projectId, sessionId: s.session.sessionId },
  });
  s.session.capabilities.view = permissions.view;
  s.session.capabilities.manage = permissions.manage;
  s.session.capabilities.questions = provider?.capabilities.questions === true;
  s.session.capabilities.permissions = provider?.capabilities.permissions === true;
  s.session.capabilities.executeWrite = permissions['execute-write'];
  s.session.capabilities.start =
    permissions.manage &&
    available &&
    s.session.readiness === 'ready' &&
    !s.activeTurn &&
    (s.session.mode !== 'workspace-write' || permissions['execute-write']);
  s.session.capabilities.cancel =
    permissions.manage && !!s.activeTurn && s.activeTurn.state !== 'unknown';
  if (!available && !s.activeTurn) s.session.readiness = 'unavailable';
  return s;
}
export function effectiveEvent(
  event: SessionChange,
  request: FastifyRequest,
  available: (providerId: string) => ProviderDescriptor | undefined,
): SessionChange {
  if (event.kind === 'session') {
    const session = event.changes.session;
    effective(
      { session, revision: 0, eventSeq: event.eventSeq, entries: [], history: { hasOlder: false } },
      request,
      available,
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
    );
  }
  return event;
}
