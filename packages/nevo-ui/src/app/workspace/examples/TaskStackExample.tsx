import { useSyncExternalStore } from 'react';
import { Button } from '../../../components';
import { defineSecondaryStack, useSecondaryStack, type SecondaryData, type SecondaryScreenProps } from '../../index';
import type { ExampleSource, TaskRecord } from './CrossFeatureSources';
import type { createChangesStack } from './ChangesStackExample';

interface TaskPages { details: Record<never, never> }

export function createTaskStack(
  source: ExampleSource<TaskRecord>,
  changesStack: ReturnType<typeof createChangesStack>,
) {
  function TaskDetails({ data }: SecondaryScreenProps<TaskRecord, TaskPages['details']>) {
    const navigation = useSecondaryStack<TaskPages>();
    return <div className="grid gap-3 p-4">
      <p>Task: {data.title}</p>
      <output data-task-updated>{data.updatedAt}</output>
      <Button onClick={() => void navigation.navTo(changesStack, { id: data.changeId })}>
        Review task changes
      </Button>
    </div>;
  }

  function useTask({ id }: { id: string }): SecondaryData<TaskRecord> {
    const task = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    return task.id === id ? { status: 'ready', data: task } : { status: 'unavailable' };
  }

  return defineSecondaryStack<{ id: string }, TaskRecord, TaskPages>({
    id: 'cross-feature-task',
    initial: 'details',
    useData: useTask,
    screens: {
      details: { title: 'Task details', component: TaskDetails },
    },
  });
}
