import type { SpecFlowEngine } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';
import type { DefinitionSource, TaskDefinitionFacts } from '../tasks';
import { createEngineAssociationTargets } from './targets';

function definition(specId: string, taskId: string): TaskDefinitionFacts {
  return {
    identity: { projectId: 'project', workspaceId: 'workspace', specId, taskId },
    task: { id: taskId, title: 'Task ' + taskId },
  } as TaskDefinitionFacts;
}

describe('Engine association targets', () => {
  it('reads a Task of another Specification as missing', async () => {
    const definitions: DefinitionSource = {
      resolve: (_specId, taskId) =>
        Promise.resolve(
          taskId === 'TASK-01'
            ? definition('S', taskId)
            : taskId === 'TASK-T'
              ? definition('T', taskId)
              : null,
        ),
    };
    const targets = createEngineAssociationTargets(undefined, definitions);
    expect(await targets.tasks('S', ['TASK-01', 'TASK-T', 'TASK-99'])).toEqual([
      { state: 'available', value: { taskId: 'TASK-01', title: 'Task TASK-01' } },
      { state: 'missing' },
      { state: 'missing' },
    ]);
    expect(await createEngineAssociationTargets(undefined).tasks('S', ['TASK-01'])).toEqual([
      { state: 'unavailable' },
    ]);
  });

  it('binds no workspace when the registry is unreadable', async () => {
    const engine = {
      readRegistry: () => Promise.reject(new Error('registry unreadable')),
    } as unknown as SpecFlowEngine;
    expect((await createEngineAssociationTargets(engine).workspaces(['S'])).size).toBe(0);
  });
});
