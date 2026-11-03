/**
 * What a new Session is asked to begin with. Not sent to the Runtime yet: the demo Session
 * allocation has no first message or name (see `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`,
 * "Integration dependencies"); the Session route receives it for that integration.
 */
export interface SessionStart {
  firstMessage: string;
  /** The user's own name; absent when the agent names the Session from the first message. */
  name?: string;
}
