import { describe, expect, it } from 'vitest';

import {
  fixtureNow,
  isoAgo,
  operationItem,
  runningItem,
  stubCreateKind,
} from '../../../test-support/operations/fixtures';
import { presentOperation } from './operationRowModel';

describe('presentOperation', () => {
  it('maps every status to a tone and a status word', () => {
    const tones = ['in-progress', 'recovery-required', 'failed', 'completed'].map(
      (status) => presentOperation(operationItem({ status }), stubCreateKind, fixtureNow).tone,
    );
    expect(tones).toEqual(['running', 'attention', 'danger', 'success']);
  });

  it('draws a status it does not know as an attention row with an unknown word', () => {
    const view = presentOperation(operationItem({ status: 'paused' }), stubCreateKind, fixtureNow);
    expect(view.tone).toBe('attention');
    expect(view.status.key).toBe('operations.status.unknown');
  });

  it('numbers the running step among the steps that are not skipped', () => {
    const view = presentOperation(runningItem(2), stubCreateKind, fixtureNow);
    expect(view.detail).toEqual({
      key: 'operations.row.step',
      values: {
        current: 3,
        total: 4,
        title: { key: 'create.progress.steps.writing-specification.title' },
      },
    });
  });

  it('has no step line without steps or without an adapter', () => {
    expect(
      presentOperation(operationItem({ steps: undefined }), stubCreateKind, fixtureNow).detail,
    ).toBeUndefined();
    expect(presentOperation(runningItem(1), undefined, fixtureNow).detail).toBeUndefined();
  });

  it('turns the interrupted code into minutes without activity', () => {
    const view = presentOperation(
      operationItem({
        status: 'recovery-required',
        code: 'OPERATION_INTERRUPTED',
        updatedAt: isoAgo(12),
      }),
      stubCreateKind,
      fixtureNow,
    );
    expect(view.detail).toEqual({ key: 'operations.row.interrupted', values: { minutes: 12 } });
    expect(view.action?.key).toBe('operations.row.checkResult');
  });

  it('names a row by its title, else by its kind, else generically', () => {
    expect(presentOperation(operationItem(), stubCreateKind, fixtureNow).name).toBe(
      'Payment limits',
    );
    expect(
      presentOperation(operationItem({ title: undefined }), stubCreateKind, fixtureNow).name,
    ).toEqual(stubCreateKind.label);
    expect(
      presentOperation(operationItem({ title: undefined }), undefined, fixtureNow).name,
    ).toEqual({ key: 'operations.kind.unknown' });
  });
});
