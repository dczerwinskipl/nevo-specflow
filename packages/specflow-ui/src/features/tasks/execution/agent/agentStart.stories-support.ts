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

export type AgentCase =
  'fresh' | 'reuse' | 'independent' | 'dirty' | 'no-agent' | 'provider-not-ready' | 'session-gone';

export const agentOptions: Record<AgentCase, AgentOption> = {
  fresh: { kind: 'available', launch: fresh, baseline: 'unchecked' },
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
  'session-gone': {
    kind: 'unavailable',
    reason: 'session-unavailable',
    launch: { ...fresh, session: { mode: 'reuse', sessionId: SESSION_ID } },
  },
};
