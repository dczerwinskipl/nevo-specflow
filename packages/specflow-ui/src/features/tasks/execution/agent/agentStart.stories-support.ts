import type { AgentLaunch, AgentOption } from '@nevo/specflow-contracts/workflow';

/*
 * The Runtime's answers about an agent for the step "Implementation" of the story Task, one per case
 * of Run with agent: shared by the stories and the component tests.
 */

export const SESSION_ID = 's-7f3a';
export const SESSION_TITLE = 'Implement token exchange';

const fresh: AgentLaunch = {
  archetype: 'implementer',
  provider: 'claude',
  model: 'claude-sonnet',
  effort: 'high',
  session: { mode: 'fresh' },
};

/** The step each case is about: an independent facet is a Review, the others are Implementation. */
export function stepOfAgentCase(agentCase: AgentCase): { id: string; title: string } {
  return agentCase === 'independent'
    ? { id: 'review', title: 'Review' }
    : { id: 'implement', title: 'Implementation' };
}

export type AgentCase =
  | 'fresh'
  | 'reuse'
  | 'independent'
  | 'dirty'
  | 'no-agent'
  | 'provider-not-ready'
  | 'model-not-offered'
  | 'session-gone';

/**
 * Hand to agent from the owner's own attempt while the owner's changes are not committed: the check
 * names them (the projection, which reads no Git, offers the fresh agent).
 */
export const ownerWorkOption: AgentOption = {
  kind: 'unavailable',
  reason: 'owner-work-uncommitted',
  paths: ['src/auth/refresh.ts', 'src/auth/refresh.test.ts'],
  count: 2,
  launch: fresh,
};

export const agentOptions: Record<AgentCase, AgentOption> = {
  fresh: {
    kind: 'available',
    launch: fresh,
    baseline: 'unchecked',
    // The Runtime names the work mode a new Session of this launch runs in.
    ...({ workMode: { providerModeId: 'acceptEdits', title: 'Accept edits' } } as object),
  },
  reuse: {
    kind: 'available',
    launch: { ...fresh, session: { mode: 'reuse', sessionId: SESSION_ID } },
    baseline: 'unchecked',
  },
  independent: {
    kind: 'available',
    launch: { ...fresh, archetype: 'reviewer' },
    independent: true,
    baseline: 'unchecked',
  },
  dirty: {
    kind: 'unavailable',
    reason: 'dirty-baseline',
    paths: ['package.json', 'scratch-notes.txt', 'src/auth/refresh.ts'],
    count: 3,
    launch: fresh,
  },
  'no-agent': { kind: 'unavailable', reason: 'provider-not-chosen' },
  'provider-not-ready': {
    kind: 'unavailable',
    reason: 'provider-not-ready',
    detail: 'Claude is not signed in on this machine. Sign in with the Claude CLI, then try again.',
    launch: fresh,
  },
  // The role's settings name a model id the provider's catalogue lists under its alias (dogfood
  // #189: `claude-opus-5-5` while Claude Code offers `opus`); the projection still says available.
  'model-not-offered': {
    kind: 'available',
    launch: { ...fresh, model: 'sonnet' },
    baseline: 'unchecked',
  },
  'session-gone': {
    kind: 'unavailable',
    reason: 'session-unavailable',
    launch: { ...fresh, session: { mode: 'reuse', sessionId: SESSION_ID } },
  },
};
