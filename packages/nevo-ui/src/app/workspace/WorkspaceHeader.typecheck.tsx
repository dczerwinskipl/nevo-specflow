import { WorkspaceHeader } from './WorkspaceHeader';

const onPress = () => undefined;

<WorkspaceHeader
  title="Document"
  actions={[
    { id: 'edit', label: 'Edit', icon: 'file', presentation: 'icon', direct: 'always', onPress },
    { id: 'save', label: 'Save', primary: true, direct: 'always', onPress },
    { id: 'discard', label: 'Discard', onPress },
  ]}
/>;

<WorkspaceHeader
  title="Document"
  actions={[
    // @ts-expect-error An icon presentation needs an icon.
    { id: 'edit', label: 'Edit', presentation: 'icon', onPress },
  ]}
/>;
