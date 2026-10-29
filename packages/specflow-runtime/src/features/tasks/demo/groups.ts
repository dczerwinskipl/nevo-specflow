import type { TaskDefinitionFacts } from '../reads/facts';

type DemoTask = TaskDefinitionFacts['task'];

/**
 * Synthetic demo workflow groups. Real projects configure their own groups; the demo
 * maps lifecycles onto the same groups the Storybook workspace fixture uses so that
 * live demo and stories show the same grouping.
 */
const demoTaskGroups = [
  { id: 'implementation', name: 'Implementacja' },
  { id: 'verification', name: 'Weryfikacja i domknięcie' },
  { id: 'done', name: 'Ukończone' },
] as const;

export type DemoTaskGroup = (typeof demoTaskGroups)[number];

export function demoTaskGroupFor(task: DemoTask): DemoTaskGroup {
  const lifecycle = task.status.lifecycle;
  if (lifecycle === 'completed') {
    return demoTaskGroups[2];
  }

  if (lifecycle === 'pending') {
    return demoTaskGroups[0];
  }

  return demoTaskGroups[1];
}

/** Groups in display order; empty groups are omitted. */
export function groupDemoTasks(tasks: readonly DemoTask[]) {
  return demoTaskGroups.flatMap((group) => {
    const members = tasks.filter((task) => demoTaskGroupFor(task).id === group.id);

    return members.length ? [{ id: group.id, name: group.name, tasks: members }] : [];
  });
}
