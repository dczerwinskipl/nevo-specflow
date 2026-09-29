import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  WorkspaceHeader,
  resolveWorkspaceHeaderActions,
  type WorkspaceHeaderAction,
} from './WorkspaceHeader';

const actions: WorkspaceHeaderAction[] = [
  {
    id: 'create',
    label: 'New customer',
    icon: 'plus',
    primary: true,
    disabled: true,
    onPress: vi.fn(),
  },
  { id: 'export', label: 'Export', icon: 'file', onPress: vi.fn() },
  {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
    primary: true,
    tone: 'danger',
    onPress: vi.fn(),
  },
];

describe('WorkspaceHeader actions', () => {
  it('selects at most one non-danger primary and preserves disabled semantics', () => {
    const resolved = resolveWorkspaceHeaderActions(actions);

    expect(resolved.directPrimary).toMatchObject({ id: 'create', disabled: true });
    expect(resolved.overflow.map((action) => action.id)).toEqual(['export', 'delete']);
    expect(resolved.overflow.at(-1)).toMatchObject({ tone: 'danger' });
  });

  it('moves every page action into overflow in compact presentation', () => {
    const resolved = resolveWorkspaceHeaderActions(actions, true);

    expect(resolved.directPrimary).toBeUndefined();
    expect(resolved.overflow).toEqual(actions);
  });

  it('keeps an accessible label on the icon-only primary representation', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceHeader actions={actions} subtitle="5 accounts" title="Customers" />,
    );

    expect(markup).toContain('aria-label="New customer"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-workspace-header-title="true"');
  });
});

