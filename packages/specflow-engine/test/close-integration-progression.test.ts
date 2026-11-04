import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { SpecFlowEngine } from '../src/application';
import { advanceCloseIntegration } from '../src/specs/lifecycle/close/integration';
import type { CloseJournal, CloseKind } from '../src/specs/lifecycle/model';

describe('Q03 shared Close integration progression', () => {
  it.each<CloseKind>(['worktree-close', 'specification-close'])(
    'fails closed on missing integration proof for %s',
    async (kind) => {
      // Deliberately malformed in-memory input. Failure must happen before
      // any Engine/Git effect; real progress is tested by lifecycle suites.
      const journal = {
        plan: { operationId: randomUUID(), kind },
        stage: 'integration-preparation-initiated',
      } as CloseJournal;
      await expect(advanceCloseIntegration({} as SpecFlowEngine, journal)).rejects.toMatchObject({
        code: 'CLOSE_RECOVERY_REQUIRED',
      });
    },
  );
});
