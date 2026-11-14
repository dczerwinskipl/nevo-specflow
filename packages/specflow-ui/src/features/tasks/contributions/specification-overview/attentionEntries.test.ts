import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../../../test-support/specs/workspace/fixtures';
import { createFakeWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import type { AttentionItem } from '../../../specs/read-model';
import {
  subscribeTaskAttention,
  type TaskAttentionRequest,
} from '../../overview/attentionRequests';
import { taskAttentionEntry } from './attentionEntries';

const specId = 'sso';
const data = createSpecificationWorkspaceFixture('working', specId);
const unsubscribe: (() => void)[] = [];
afterEach(() => unsubscribe.splice(0).forEach((stop) => stop()));

function item(fields: Partial<AttentionItem>): AttentionItem {
  return {
    id: 'task-attention.TASK-03',
    kind: 'task',
    title: 'Obsługa odświeżania',
    reason: 'display text',
    actionLabel: '',
    targetId: 'TASK-03',
    ...fields,
  };
}

function entryOf(fields: Partial<AttentionItem>) {
  const actions = createFakeWorkspaceRuntime({ openTask: vi.fn(), openTasks: vi.fn() });
  const requests: TaskAttentionRequest[] = [];
  unsubscribe.push(subscribeTaskAttention(specId, (request) => requests.push(request) > 0));

  return { entry: taskAttentionEntry(item(fields), { specId, data, actions }), actions, requests };
}

describe('Requires attention: a workflow item maps its action to the existing flow', () => {
  it('review-tasks opens the Tasks page filtered to the Tasks blocking the Specification', () => {
    const { entry, actions } = entryOf({
      kind: 'specification',
      targetId: undefined,
      code: 'tasks-stuck',
      action: 'review-tasks',
      taskIds: ['T-04', 'T-05'],
    });
    entry.action!.onClick();

    expect(actions.openTasks).toHaveBeenCalledWith({ blocking: 'specification' });
    // The intervention, not the diagnosis (Now carries that).
    expect(entry.title).toEqual({ key: 'taskOverview.attention.stuckTitle', values: { count: 2 } });
    expect(entry.reason).toEqual({ key: 'taskOverview.attention.stuckReason' });
    expect(entry.facts).toEqual([{ key: 'taskOverview.attention.specification' }]);
  });

  it.each([
    ['edit-context', 'context'],
    ['edit-dependencies', 'dependencies'],
  ] as const)('%s opens the Task at its %s section', (action, section) => {
    const { entry, actions } = entryOf({ code: 'context-unresolved', action });
    entry.action!.onClick();

    expect(actions.openTask).toHaveBeenCalledWith('TASK-03', section);
  });

  it.each(['restore-task', 'satisfy-gate'] as const)('%s opens the Task', (action) => {
    const { entry, actions } = entryOf({ code: 'task-broken', action });
    entry.action!.onClick();

    expect(actions.openTask).toHaveBeenCalledWith('TASK-03');
  });

  it('a broken Task reads in the danger tone; others in the attention tone', () => {
    expect(entryOf({ code: 'task-broken', action: 'restore-task' }).entry).toMatchObject({
      tone: 'danger',
      reasonIcon: 'circle-alert',
    });
    expect(entryOf({ code: 'owner-action', action: 'start-step' }).entry).toMatchObject({
      tone: 'attention',
      reasonIcon: 'triangle-alert',
    });
  });

  it('start-step, confirm-definition and cancel-task hand the Task to the Overview flows', () => {
    const start = entryOf({ code: 'owner-action', action: 'start-step' });
    start.entry.action!.onClick();
    const confirm = entryOf({
      code: 'definition-changed',
      action: 'confirm-definition',
      secondaryAction: 'cancel-task',
    });
    confirm.entry.action!.onClick();
    confirm.entry.secondaryAction!.onClick();

    expect([...start.requests, ...confirm.requests]).toEqual(
      expect.arrayContaining([
        { kind: 'start-step', taskId: 'TASK-03' },
        { kind: 'first-start', taskId: 'TASK-03' },
        { kind: 'cancel-task', taskId: 'TASK-03' },
      ]),
    );
  });

  it("returns the Specification through its own Return dialog, a Task's on the Task page", () => {
    const specification = entryOf({
      kind: 'specification',
      targetId: undefined,
      code: 'tasks-stuck',
      action: 'return-to-step',
    });
    specification.entry.action!.onClick();
    const task = entryOf({ code: 'task-escalated', action: 'return-to-step' });
    task.entry.action!.onClick();

    expect(specification.requests).toContainEqual({ kind: 'return-to-step' });
    expect(task.actions.openTask).toHaveBeenCalledWith('TASK-03');
  });

  it('project settings has no UI yet: shown unavailable, with Cancel task beside it', () => {
    const { entry } = entryOf({
      code: 'type-not-allowed',
      action: 'open-project-settings',
      secondaryAction: 'cancel-task',
    });

    expect(entry.action).toMatchObject({
      disabled: true,
      disabledTitleKey: 'common.notImplemented',
    });
    expect(entry.secondaryAction?.disabled).toBeUndefined();
  });

  it('names the Task by id and type, never from a status', () => {
    const { entry } = entryOf({ code: 'owner-action', action: 'start-step' });

    expect(entry.facts).toEqual(['TASK-03']);
  });
});
