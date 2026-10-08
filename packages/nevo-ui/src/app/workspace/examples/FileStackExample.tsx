import { useState, useSyncExternalStore } from 'react';
import { defineSecondaryStack, type SecondaryData, type SecondaryScreenProps } from '../../index';
import type { ExampleSource, FileRecord } from './CrossFeatureSources';

interface FilePages { details: Record<never, never> }
let mountCounter = 0;

function FileDetails({ data }: SecondaryScreenProps<FileRecord, FilePages['details']>) {
  const [mountId] = useState(() => ++mountCounter);
  return <div className="grid gap-3 p-4">
    <p>File: {data.path}</p>
    <p>{data.content}</p>
    <output data-cross-feature-updated>{data.updatedAt}</output>
    <output data-cross-feature-mount>{mountId}</output>
  </div>;
}

export function createFileStack(source: ExampleSource<FileRecord>) {
  function useFile({ id }: { id: string }): SecondaryData<FileRecord> {
    const file = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    return file.id === id ? { status: 'ready', data: file } : { status: 'unavailable' };
  }
  return defineSecondaryStack<{ id: string }, FileRecord, FilePages>({
    id: 'cross-feature-file',
    initial: 'details',
    useData: useFile,
    screens: {
      details: { title: 'File details', component: FileDetails },
    },
  });
}
