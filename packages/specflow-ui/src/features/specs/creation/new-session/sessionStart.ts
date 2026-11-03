/**
 * What a new Session is started with. Not sent to the Runtime yet: the demo Session allocation has
 * no name (see `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`, "Integration dependencies");
 * the Session route receives it for that integration. The Session opens idle: the first message is
 * written in its own Composer.
 */
export interface SessionStart {
  /** The user's own name; absent when the agent names the Session from the first message. */
  name?: string;
}
