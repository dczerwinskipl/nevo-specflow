import { describe, expect, it } from 'vitest';
import { dependencyCandidates } from './dependencyModel';

const task = (id: string, dependsOn: string[] = []) => ({
  id,
  title: id,
  statusLabel: 'Ready',
  dependsOn,
});

describe('dependencyCandidates', () => {
  it('marks existing dependencies and the Tasks that would close a cycle, directly or not', () => {
    const tasks = [
      task('t-01'),
      task('t-02'),
      task('t-04', ['t-02']),
      task('t-05', ['t-07']),
      task('t-07', ['t-04']),
    ];

    expect(
      dependencyCandidates(tasks, 't-04', ['t-02']).map(({ task: { id }, state }) => [id, state]),
    ).toEqual([
      ['t-01', 'available'],
      ['t-02', 'existing'],
      ['t-05', 'cycle'],
      ['t-07', 'cycle'],
    ]);
  });
});
