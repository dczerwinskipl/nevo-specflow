import { describe, expect, it } from 'vitest';
import { buildDemoTaskContribution } from './contribution';
import { createDemoTaskSources } from './sources';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';

const record = {
  id: 'admission',
  title: 'Admission',
  progress: { completed: 5, total: 9 },
  currentExecutions: [{ sessionId: 's', agentRole: 'Implementer', taskIds: ['TASK-02'] }],
} as unknown as DemoSpecification;

describe('demo task groups', () => {
  it('maps lifecycles onto configured workflow groups in display order', () => {
    const groups = buildDemoTaskContribution(record).data.groups;
    expect(groups.map((group) => [group.name, group.tasks.length])).toEqual([
      ['Implementation', 3],
      ['Verification and wrap-up', 1],
      ['Completed', 5],
    ]);
  });

  it('omits empty groups', () => {
    const groups = buildDemoTaskContribution({
      ...record,
      progress: { completed: 2, total: 2 },
      currentExecutions: [],
    }).data.groups;
    expect(groups.map((group) => group.id)).toEqual(['done']);
  });

  it('resolves task detail with the same group as the workspace contribution', async () => {
    const catalogue = { find: () => Promise.resolve(record) } as unknown as DemoCatalogue;
    const definition = await createDemoTaskSources(catalogue).definitions!.resolve(
      'admission',
      'TASK-02',
    );
    expect(definition?.group).toEqual({ id: 'verification', label: 'Verification and wrap-up' });
  });
});
