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

<WorkspaceHeader
  title="Document"
  menu="complete"
  labels={{ moreActions: 'More', menuDisplay: 'View', menuActions: 'Do' }}
  actions={[
    {
      id: 'preview',
      label: 'Preview',
      icon: 'eye',
      presentation: 'icon',
      pressed: true,
      group: 'display',
      checked: true,
      shortcut: 'Ctrl+P',
      onPress,
    },
  ]}
/>;

<WorkspaceHeader
  title="Document"
  actions={[
    {
      id: 'save',
      label: 'Save',
      icon: 'file',
      presentation: 'icon',
      primary: true,
      // @ts-expect-error A primary action has no pressed state.
      pressed: true,
      onPress,
    },
  ]}
/>;
