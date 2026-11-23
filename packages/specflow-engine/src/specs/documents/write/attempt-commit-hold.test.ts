import { describe, expect, it } from 'vitest';

import type { AttemptCommitPathHolds } from '../../uncommitted/attempts';
import { attemptCommitHeld } from './attempt-commit-hold';

const TURN = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const holds: AttemptCommitPathHolds = {
  readable: true,
  holds: [
    {
      wait: {
        reason: 'attempt-commit-failed',
        code: 'MANUAL_COMMIT_CONFLICT',
        attemptId: '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02',
        subject: { specId: 'spec-1' },
        step: 'requirements',
        attempt: 1,
        stepTitle: 'Requirements',
      },
      invocations: new Set([TURN]),
      paths: ['specs/active/one/overview.md', 'src/app.ts'],
    },
  ],
};
const plan = (...paths: string[]) => ({ paths: paths.map((path) => ({ path })) }) as never;

describe('a write to a path a waiting attempt commit takes', () => {
  it('is refused for anyone but the attempt, naming the attempt and the held paths', () => {
    const error = attemptCommitHeld(
      holds,
      plan('specs/active/one/Overview.md', 'specs/active/one/specification.yaml'),
      undefined,
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'attempt-commit', paths: ['specs/active/one/Overview.md'] },
    });
    expect(error?.message).toContain('Requirements (requirements#1)');
    expect(error?.message).toContain('failed (MANUAL_COMMIT_CONFLICT)');
    expect(attemptCommitHeld(holds, plan('src/app.ts'), { operationId: 'other' })).toBeDefined();
  });

  it('is admitted for the attempt’s own Turns and for the other paths', () => {
    expect(attemptCommitHeld(holds, plan('src/app.ts'), { operationId: TURN })).toBeUndefined();
    expect(attemptCommitHeld(holds, plan('specs/active/one/notes.md'), undefined)).toBeUndefined();
  });

  it('fails closed when the holds cannot be read', () => {
    expect(
      attemptCommitHeld({ readable: false }, plan('specs/active/one/notes.md'), undefined),
    ).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'attempt-record-unreadable' },
    });
  });
});
