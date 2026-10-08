import { useSyncExternalStore } from 'react';
import { Button } from '../../../components';
import { defineSecondaryStack, useSecondaryStack, type SecondaryData, type SecondaryScreenProps } from '../../index';
import type { ChangeRecord, ExampleSource } from './CrossFeatureSources';
import type { createFileStack } from './FileStackExample';

interface ChangesPages { details: Record<never, never> }

export function createChangesStack(
  source: ExampleSource<ChangeRecord>,
  fileStack: ReturnType<typeof createFileStack>,
) {
  function ChangesDetails({ data }: SecondaryScreenProps<ChangeRecord, ChangesPages['details']>) {
    const navigation = useSecondaryStack<ChangesPages>();
    return <div className="grid gap-3 p-4">
      <p>Changes: {data.title}</p>
      <output data-change-updated>{data.updatedAt}</output>
      <Button onClick={() => void navigation.navTo(fileStack, { id: data.fileId })}>
        Inspect changed file
      </Button>
    </div>;
  }

  function useChanges({ id }: { id: string }): SecondaryData<ChangeRecord> {
    const change = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    return change.id === id ? { status: 'ready', data: change } : { status: 'unavailable' };
  }

  return defineSecondaryStack<{ id: string }, ChangeRecord, ChangesPages>({
    id: 'cross-feature-changes',
    initial: 'details',
    useData: useChanges,
    screens: {
      details: { title: 'Changes', component: ChangesDetails },
    },
  });
}
