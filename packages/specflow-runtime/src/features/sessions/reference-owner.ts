import type { SessionAssociationRef } from '@nevo/specflow-contracts/sessions';
import type { SessionScopeIdentity } from './scope';

/** Identity facts of an associated Session, supplied by the Session owner; never inferred from a URL. */
export interface SessionReference {
  sessionId: string;
  /** The Session's immutable home Specification. */
  specId: string;
  projectId: string;
  /** The home Specification's current workspace binding, resolved at read time. */
  workspaceId: string;
}
export interface SessionReferenceOwner {
  /** `null` for an unknown or standalone Session. */
  resolve(sessionId: string): Promise<SessionReference | null>;
  /** One batch for many references; unknown and standalone Sessions are omitted. */
  resolveMany(sessionIds: readonly string[]): Promise<ReadonlyMap<string, SessionReference>>;
}
/**
 * The association port of the Session association module: the reference seam plus what the
 * association read needs. Implemented by the Session store (project mode) or the demo catalogue.
 */
export interface SessionAssociations extends SessionReferenceOwner {
  /** Store-derived identity, including the home `specId`; `SESSION_NOT_FOUND` when unknown. */
  identity(sessionId: string): Promise<SessionScopeIdentity>;
  /** The Session's home Specification and Tasks; `null` for a standalone Session. */
  association(sessionId: string): Promise<SessionAssociationRef | null>;
}
