import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_COMMIT_PENDING_CODE,
  attemptsHolding,
  type WaitingAttemptCommit,
} from './attempts';

const attempt: WaitingAttemptCommit = {
  attemptId: 'attempt-1',
  specId: 'spec-b',
  step: 'write',
  attempt: 1,
  stepTitle: 'Write it',
  code: ATTEMPT_COMMIT_PENDING_CODE,
  paths: ['specs/active/b/.execution/state.json'],
  declared: ['src/app.ts'],
};

describe('attemptsHolding', () => {
  it('groups a path spelled in another case under its attempt, as the checkout spells it', () => {
    const present = ['specs/active/b/.execution/STATE.json', 'SRC/app.ts', 'scratch.txt'];
    const { attempts, taken } = attemptsHolding([attempt], present, 10);
    expect(attempts).toEqual([
      expect.objectContaining({
        attemptId: 'attempt-1',
        count: 2,
        paths: ['SRC/app.ts', 'specs/active/b/.execution/STATE.json'],
      }),
    ]);
    expect([...taken].sort()).toEqual(['SRC/app.ts', 'specs/active/b/.execution/STATE.json']);
  });

  it("lists every declared file with `declared: 'always'`, present or not", () => {
    const { attempts } = attemptsHolding([attempt], [], 10, 'always');
    expect(attempts).toEqual([expect.objectContaining({ count: 1, paths: ['src/app.ts'] })]);
  });
});
