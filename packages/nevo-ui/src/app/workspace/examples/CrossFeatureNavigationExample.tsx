import { useState } from 'react';
import { Button } from '../../../components';
import { AppContent, AppWorkspace, AppWorkspaceProvider, WorkspaceHeader, useSecondaryNavigation } from '../../index';
import { AppShell } from '../../shell/AppShell';
import { createChangesStack } from './ChangesStackExample';
import { createCrossFeatureSources, type CrossFeatureSources } from './CrossFeatureSources';
import { createFileStack } from './FileStackExample';
import { createTaskStack } from './TaskStackExample';

function CrossFeaturePrimary({ sources }: { sources: CrossFeatureSources }) {
  const navigation = useSecondaryNavigation();
  const [taskStack] = useState(() => {
    const file = createFileStack(sources.file);
    const changes = createChangesStack(sources.changes, file);
    return createTaskStack(sources.task, changes);
  });

  return <AppWorkspace split="primary">
    <AppWorkspace.Primary header={<WorkspaceHeader title="Specification workbench" />}>
      <AppContent>
        <div className="flex flex-wrap gap-2 p-5">
          <Button onClick={() => void navigation.open(taskStack, { id: 'task-1' })}>Open Task</Button>
          <Button variant="secondary" onClick={sources.refresh}>Refresh three sources</Button>
        </div>
      </AppContent>
    </AppWorkspace.Primary>
    <AppWorkspace.Secondary header={<WorkspaceHeader title="Activity" />}>
      <p className="p-4">Default activity panel</p>
    </AppWorkspace.Secondary>
  </AppWorkspace>;
}

export function CrossFeatureNavigationExample({ width = 1400 }: { width?: number }) {
  const [sources] = useState(createCrossFeatureSources);
  const [scopeKey, setScopeKey] = useState('spec-A');
  return <div style={{ height: 700, width, maxWidth: '100%' }}>
    <button type="button" onClick={() => setScopeKey(s => s === 'spec-A' ? 'spec-B' : 'spec-A')}>
      Switch specification scope ({scopeKey})
    </button>
    <AppWorkspaceProvider scopeKey={scopeKey}>
      <AppShell navigation={<div className="p-5">Product navigation</div>} style={{ height: 650, width: '100%' }}>
        <CrossFeaturePrimary sources={sources} />
      </AppShell>
    </AppWorkspaceProvider>
  </div>;
}
