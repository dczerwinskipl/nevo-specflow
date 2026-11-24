import { describe, expect, it } from 'vitest';

import {
  isOwnAttemptCommit,
  mintAttemptCommitAuthority,
  type AttemptCommitHolds,
  type AttemptCommitPathHold,
} from '../uncommitted/attempts';
import { attemptCommitHeld } from './attempt-commit-hold';

const TURN = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const ATTEMPT = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const holds: AttemptCommitHolds = {
  readable: true,
  holds: [
    {
      wait: {
        reason: 'attempt-commit-failed',
        code: 'MANUAL_COMMIT_CONFLICT',
        attemptId: ATTEMPT,
        subject: { specId: 'spec-1' },
        step: 'requirements',
        attempt: 1,
        stepTitle: 'Requirements',
      },
      invocations: new Set([TURN]),
      ledger: ['specs/active/one/overview.md'],
      declared: ['src/app.ts'],
      paths: ['specs/active/one/overview.md', 'src/app.ts'],
    },
  ],
  executions: new Set([TURN]),
};
const byTurn = (operationId: string | undefined) => (hold: AttemptCommitPathHold) =>
  operationId !== undefined && hold.invocations.has(operationId);
const nobody = () => false;

describe('a write or commit of a path a waiting attempt commit takes', () => {
  it('is refused for anyone but the attempt, naming the attempt and the held paths', () => {
    const error = attemptCommitHeld(
      holds,
      ['specs/active/one/Overview.md', 'specs/active/one/specification.yaml'],
      'change',
      nobody,
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'attempt-commit', paths: ['specs/active/one/Overview.md'] },
    });
    expect(error?.message).toContain('Requirements (requirements#1)');
    expect(error?.message).toContain('failed (MANUAL_COMMIT_CONFLICT)');
    expect(attemptCommitHeld(holds, ['src/app.ts'], 'change', byTurn('other'))).toBeDefined();
  });

  it('is admitted for the attempt’s own Turns and for the other paths', () => {
    expect(attemptCommitHeld(holds, ['src/app.ts'], 'change', byTurn(TURN))).toBeUndefined();
    expect(
      attemptCommitHeld(holds, ['specs/active/one/notes.md'], 'change', nobody),
    ).toBeUndefined();
  });

  it('is committed only by the attempt’s own commit, proven by the authority minted for it', () => {
    const commit = (authority: Parameters<typeof isOwnAttemptCommit>[0]) =>
      attemptCommitHeld(holds, ['src/app.ts'], 'commit', (hold) =>
        isOwnAttemptCommit(authority, hold),
      );
    expect(commit(mintAttemptCommitAuthority(ATTEMPT))).toBeUndefined();
    // Another attempt's authority, a copy of this one and none at all are no proof.
    const refused = { details: { cause: 'attempt-commit' } };
    expect(commit(mintAttemptCommitAuthority(TURN))).toMatchObject(refused);
    expect(commit({ attemptId: ATTEMPT })).toMatchObject(refused);
    expect(commit(undefined)?.message).toContain("Only that attempt's own commit takes them");
  });

  it('fails closed when the holds cannot be read', () => {
    expect(
      attemptCommitHeld({ readable: false }, ['specs/active/one/notes.md'], 'commit', nobody),
    ).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'attempt-record-unreadable' },
    });
  });
});
