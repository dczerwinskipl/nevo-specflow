import type { AttentionItem } from '@nevo/specflow-engine';
import { WorkspaceAttentionSchema } from '@nevo/specflow-contracts/specs/workspace';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { workspaceAttentionOf } from './engine-contribution';

describe('workspaceAttentionOf', () => {
  it('passes on what a held Task holds up, as the Engine reports it', () => {
    const item: AttentionItem = {
      subject: { kind: 'task', specId: 'spec', taskId: 'api' },
      step: 'acceptance',
      stepTitle: 'Acceptance',
      reason: 'on-hold-blocking',
      actor: 'owner',
      action: 'resume-task',
      secondaryAction: 'cancel-task',
      blocks: { taskIds: ['screen'], finish: 'acceptance' },
      message: 'It is on hold and holds up screen and keeps "Acceptance" from finishing.',
    };

    const record = workspaceAttentionOf(item, new Map([['api', 'API']]));

    expect(record).toMatchObject({
      id: 'task-attention.api',
      kind: 'task',
      title: 'API',
      targetId: 'api',
      code: 'on-hold-blocking',
      action: 'resume-task',
      secondaryAction: 'cancel-task',
      blocks: { taskIds: ['screen'], finish: 'acceptance' },
    });
    expect(Value.Check(WorkspaceAttentionSchema, record)).toBe(true);
  });
});
