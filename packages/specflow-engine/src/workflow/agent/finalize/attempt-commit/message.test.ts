import { describe, expect, it } from 'vitest';

import type { AgentAttemptJournal } from '../../journal/model';
import { attemptCommitMessage } from './message';

const agent = { class: 'agent', details: { provider: 'claude', model: 'opus' } } as const;
const journal = (taskId?: string): AgentAttemptJournal => ({
  version: 1,
  operationId: '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02',
  subject:
    taskId !== undefined
      ? { kind: 'task', specId: 's', taskId }
      : { kind: 'specification', specId: 's' },
  step: 'implement',
  attempt: 3,
  actor: agent,
  workspaceId: '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01',
  turns: [{ invocationId: '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03', turnId: 't', boundAt: 'x' }],
});

describe('the attempt commit message', () => {
  it('names the subject, the step, the attempt and the Specification, with its trailers', () => {
    expect(attemptCommitMessage(journal('api'), 'Implement\nthe API', 'my-spec')).toEqual({
      subject: 'spec(api): Implement the API (attempt 3) by agent in my-spec',
      body: 'Step implement, attempt 3, by agent claude · opus.',
      trailers: {
        'Nevo-Action': 'attempt-commit',
        'Nevo-Attempt': '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02',
        'Nevo-Step': 'implement#3',
        'Nevo-Model': 'opus',
        'Nevo-Task': 'api',
      },
    });
  });

  it('names the tool and the model by their titles for people, and keeps the id in the trailer', () => {
    const titled = {
      ...journal(),
      actor: {
        class: 'agent',
        details: {
          provider: 'claude',
          providerTitle: 'Claude Code',
          model: 'opus',
          modelTitle: 'Opus 5.5',
        },
      },
    } as const;
    expect(attemptCommitMessage(titled, 'Implement', 'my-spec')).toMatchObject({
      body: 'Step implement, attempt 3, by agent Claude Code · Opus 5.5.',
      trailers: { 'Nevo-Model': 'opus' },
    });
  });

  it('takes a shorter form whole when the subject does not fit, and moves the rest to the body', () => {
    const slug = 's'.repeat(60);
    const title = 'T'.repeat(60);
    expect(attemptCommitMessage(journal(), 'Short', slug)).toMatchObject({
      subject: 'spec(specification): Short (attempt 3) by agent',
      body: `Step implement, attempt 3, by agent claude · opus.\nSpecification: ${slug}`,
    });
    expect(attemptCommitMessage(journal(), title, 'my-spec')).toMatchObject({
      subject: 'spec(specification): attempt 3 by agent in my-spec',
      body: `Step: ${title}\nStep implement, attempt 3, by agent claude · opus.`,
    });
    expect(attemptCommitMessage(journal(), title, slug).subject).toBe(
      'spec(specification): attempt 3 by agent',
    );
  });
});
