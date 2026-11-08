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
