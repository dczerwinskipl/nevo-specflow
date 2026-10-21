import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  WorkspaceHeader,
  WorkspaceHeaderFrame,
  WorkspaceHeaderIdentity,
  resolveWorkspaceHeaderActions,
  getWorkspaceHeaderActions,
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
  it('keeps structured location outside heading semantics while retaining compact actions', () => {
    const header = (
      <WorkspaceHeader
        title="Overview"
        as="span"
        identityContent={
          <nav aria-label="Location">
            <span aria-current="page">Overview</span>
          </nav>
        }
        actions={actions}
      />
    );
    expect(getWorkspaceHeaderActions(header)).toEqual(actions);
    const html = renderToStaticMarkup(header);
    expect(html).toContain('aria-label="Location"');
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).toContain('New customer');
  });
  it('automatically renders declared actions beside custom identity exactly once', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceHeaderFrame
        content={<WorkspaceHeaderIdentity headingLevel={2} title="Inspector" />}
        actions={actions}
      />,
    );

    expect(markup).toContain('data-workspace-header="true"');
    expect(markup).toContain('<h2');
    expect(markup).toContain('aria-label="New customer"');
    expect((markup.match(/aria-label="New customer"/g) ?? []).length).toBe(1);
  });

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

  it('allows generated overflow copy to be localized', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceHeader
        actions={actions}
        labels={{ moreActions: 'Więcej działań' }}
        title="Klienci"
      />,
    );

    expect(markup).toContain('aria-label="Więcej działań"');
  });
});

describe('WorkspaceHeader direct action budget', () => {
  const press = vi.fn();
  const preview: WorkspaceHeaderAction = {
    id: 'preview',
    label: 'Preview',
    icon: 'eye',
    presentation: 'icon',
    direct: 'wide',
    onPress: press,
  };
  const save: WorkspaceHeaderAction = {
    id: 'save',
    label: 'Save',
    primary: true,
    direct: 'always',
    onPress: press,
  };
  const discard: WorkspaceHeaderAction = { id: 'discard', label: 'Discard', onPress: press };
  const edit: WorkspaceHeaderAction = {
    id: 'edit',
    label: 'Edit',
    icon: 'file',
    presentation: 'icon',
    direct: 'always',
    onPress: press,
  };
  const ids = (list: readonly WorkspaceHeaderAction[]) => list.map((action) => action.id);

  it('shows two direct actions on wide headers with the filled primary last', () => {
    const resolved = resolveWorkspaceHeaderActions([preview, save, discard], 'wide');
    expect(ids(resolved.direct)).toEqual(['preview', 'save']);
    expect(ids(resolved.overflow)).toEqual(['discard']);
    expect(resolved.directPrimary?.id).toBe('save');
  });

  it('shows one direct action on narrow headers and keeps the rest in input order', () => {
    const resolved = resolveWorkspaceHeaderActions([preview, save, discard], 'narrow');
    expect(ids(resolved.direct)).toEqual(['save']);
    expect(ids(resolved.overflow)).toEqual(['preview', 'discard']);
  });

  it('lets direct always win the narrow slot over the primary', () => {
    const resolved = resolveWorkspaceHeaderActions(
      [{ ...save, direct: undefined }, edit, discard],
      'narrow',
    );
    expect(ids(resolved.direct)).toEqual(['edit']);
    expect(ids(resolved.overflow)).toEqual(['save', 'discard']);
  });

  it('supports the view state: a single always-direct icon action', () => {
    expect(ids(resolveWorkspaceHeaderActions([edit], 'wide').direct)).toEqual(['edit']);
    expect(ids(resolveWorkspaceHeaderActions([edit], 'narrow').direct)).toEqual(['edit']);
  });

  it('never makes danger or never-direct actions direct and enforces the budget', () => {
    const danger: WorkspaceHeaderAction = {
      id: 'delete',
      label: 'Delete',
      primary: true,
      tone: 'danger',
      direct: 'always',
      onPress: press,
    };
    const never: WorkspaceHeaderAction = { ...save, id: 'never', direct: 'never' };
    expect(ids(resolveWorkspaceHeaderActions([danger, never], 'wide').direct)).toEqual([]);
    const many = [edit, { ...edit, id: 'edit2' }, { ...edit, id: 'edit3' }, save];
    expect(resolveWorkspaceHeaderActions(many, 'wide').direct).toHaveLength(2);
    expect(resolveWorkspaceHeaderActions(many, 'narrow').direct).toHaveLength(1);
    expect(resolveWorkspaceHeaderActions(many, 'wide').overflow).toHaveLength(2);
  });

  it('keeps the legacy single-primary behaviour for actions without direct', () => {
    const resolved = resolveWorkspaceHeaderActions(actions, 'wide');
    expect(resolved.directPrimary?.id).toBe('create');
    expect(ids(resolved.overflow)).toEqual(['export', 'delete']);
    expect(ids(resolveWorkspaceHeaderActions(actions, 'narrow').direct)).toEqual(['create']);
  });

  it('puts everything in the overflow in compact density, as a superset', () => {
    const resolved = resolveWorkspaceHeaderActions([preview, save, discard], 'compact');
    expect(resolved.direct).toEqual([]);
    expect(ids(resolved.overflow)).toEqual(['preview', 'save', 'discard']);
  });

  it('renders icon actions as labelled icon buttons and never duplicates a direct action', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceHeaderFrame
        content={<WorkspaceHeaderIdentity title="Doc" />}
        actions={[preview, save, discard]}
      />,
    );
    expect(markup).toContain('aria-label="Preview"');
    expect(markup).toContain('data-workspace-header-density="wide"');
    expect((markup.match(/aria-label="Preview"/g) ?? []).length).toBe(1);
  });
});
