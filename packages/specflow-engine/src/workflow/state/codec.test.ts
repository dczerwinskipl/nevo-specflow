import { describe, expect, it } from 'vitest';

import type { AttentionItem } from '../attention/model';
import { parseAttention, serializeAttention } from './codec';

const escalated: AttentionItem = {
  subject: { kind: 'specification', specId: 'spec-1' },
  step: 'implementation',
  reason: 'task-escalated',
  taskIds: ['api', 'web'],
  createdAt: '2026-11-05T10:00:00.000Z',
};

describe('attention codec', () => {
  it('keeps every escalated Task of a task-escalated item', () => {
    expect(parseAttention(serializeAttention([escalated]))).toEqual([escalated]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a single Task id', { taskId: 'api', taskIds: undefined }],
    ['an empty Task list', { taskIds: [] }],
    ['a repeated Task id', { taskIds: ['api', 'api'] }],
  ])('refuses %s', (_name, change) => {
    const text = JSON.stringify({ version: 1, items: [{ ...escalated, ...change }] });

    expect(() => parseAttention(text)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});
