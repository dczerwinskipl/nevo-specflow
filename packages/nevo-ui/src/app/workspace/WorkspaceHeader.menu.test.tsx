// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompactWorkspaceActions,
  WorkspaceHeader,
  resolveWorkspaceHeaderActions,
  type WorkspaceHeaderAction,
} from './WorkspaceHeader';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: 800, height: 56 }) as DOMRect,
  );
  Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const press = () => undefined;

const wrap: WorkspaceHeaderAction = {
  id: 'wrap',
  label: 'Word wrap',
  icon: 'file',
  group: 'display',
  checked: false,
  onPress: press,
};
const preview: WorkspaceHeaderAction = {
  id: 'preview',
  label: 'Show preview',
  icon: 'eye',
  presentation: 'icon',
  direct: 'wide',
  group: 'display',
  pressed: true,
  onPress: press,
};
const save: WorkspaceHeaderAction = {
  id: 'save',
  label: 'Save',
  primary: true,
  direct: 'always',
  shortcut: 'Ctrl+S',
  onPress: press,
};
const remove: WorkspaceHeaderAction = {
  id: 'delete',
  label: 'Delete file',
  icon: 'trash',
  tone: 'danger',
  direct: 'always',
  onPress: press,
};

function openMenu(name = 'More actions') {
  const trigger = screen.getByRole('button', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.getByRole('menu');
}

describe('WorkspaceHeader open menu', () => {
  it('honours checked and shortcut in the default menu and lists the overflow only', () => {
    render(
      <WorkspaceHeader
        title="Doc"
        actions={[
          { ...save, direct: 'never', primary: false },
          { ...wrap, checked: true, shortcut: 'Alt+Z' },
        ]}
      />,
    );
    const menu = openMenu();
    const checkbox = within(menu).getByRole('menuitemcheckbox', { name: /Word wrap/ });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(checkbox.textContent).toContain('Alt+Z');
    expect(checkbox.querySelector('svg')).not.toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Save/ }).textContent).toContain('Ctrl+S');
    expect(menu.querySelector('[role="group"]')).toBeNull();
  });

  it('renders actions without checked or shortcut as plain rows with no trailing slot', () => {
    render(<WorkspaceHeader title="Doc" actions={[{ id: 'a', label: 'Plain', onPress: press }]} />);
    const item = within(openMenu()).getByRole('menuitem', { name: 'Plain' });
    expect(item.getAttribute('aria-checked')).toBeNull();
    expect(item.querySelector('[data-design-slot="shortcut"], .ml-auto')).toBeNull();
    expect(item.textContent).toBe('Plain');
  });

  it('shows the shortcut before the check on a toggle', () => {
    render(
      <WorkspaceHeader
        title="Doc"
        actions={[{ ...wrap, checked: true, shortcut: 'Alt+Z' }]}
        menu="complete"
      />,
    );
    const row = within(openMenu()).getByRole('menuitemcheckbox');
    const trailing = row.querySelector('.ml-auto')!;
    expect(trailing.textContent).toBe('Alt+Z');
    expect(trailing.lastElementChild?.querySelector('svg') ?? null).not.toBeNull();
    expect(trailing.firstChild?.textContent).toBe('Alt+Z');
  });

  it('localizes the group labels', () => {
    render(
      <WorkspaceHeader
        title="Doc"
        menu="complete"
        labels={{ moreActions: 'Więcej', menuDisplay: 'Widok', menuActions: 'Działania' }}
        actions={[wrap, save]}
      />,
    );
    const menu = openMenu('Więcej');
    expect(within(menu).getByRole('group', { name: 'Widok' })).toBeTruthy();
    expect(within(menu).getByRole('group', { name: 'Działania' })).toBeTruthy();
    expect(within(menu).queryByText('Display')).toBeNull();
  });

  it('keeps the complete menu scrollable within the available viewport height', () => {
    render(<WorkspaceHeader title="Doc" menu="complete" actions={[wrap, save]} />);
    const menu = openMenu();
    expect(menu.className).toContain(
      'max-h-[var(--radix-dropdown-menu-content-available-height)]',
    );
    expect(menu.className).toContain('overflow-y-auto');
  });

  it('lists a danger action with its tone and never promotes it', () => {
    expect(
      resolveWorkspaceHeaderActions([remove, save], 'wide').direct.map((action) => action.id),
    ).toEqual(['save']);
    render(<WorkspaceHeader title="Doc" menu="complete" actions={[remove, save]} />);
    expect(screen.queryByRole('button', { name: 'Delete file' })).toBeNull();
    const row = within(openMenu()).getByRole('menuitem', { name: /Delete file/ });
    expect(row.getAttribute('data-tone')).toBe('danger');
  });

  it('keeps the direct icon and menu toggle in sync when checked overrides pressed', () => {
    render(
      <WorkspaceHeader
        title="Doc"
        menu="complete"
        actions={[
          { ...preview, id: 'a', label: 'Pressed only' },
          { ...preview, id: 'b', label: 'Checked wins', pressed: true, checked: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pressed only' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Checked wins' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    const menu = openMenu();
    expect(
      within(menu)
        .getByRole('menuitemcheckbox', { name: /Pressed only/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      within(menu)
        .getByRole('menuitemcheckbox', { name: /Checked wins/ })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('uses checked as the direct icon state even when pressed is omitted', () => {
    render(
      <WorkspaceHeader
        title="Doc"
        menu="complete"
        actions={[{ ...preview, pressed: undefined, checked: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Show preview' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      within(openMenu())
        .getByRole('menuitemcheckbox', { name: /Show preview/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('keeps the direct icon aria-pressed while the promoted row is a checked menu item', () => {
    render(<WorkspaceHeader title="Doc" menu="complete" actions={[preview, save]} />);
    expect(screen.getByRole('button', { name: 'Show preview' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      within(openMenu())
        .getByRole('menuitemcheckbox', { name: /Show preview/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('CompactWorkspaceActions menu', () => {
  it('reads menu="complete" from the header and groups every action', () => {
    render(
      <CompactWorkspaceActions
        header={
          <WorkspaceHeader
            title="Doc"
            menu="complete"
            labels={{ moreActions: 'Więcej', menuDisplay: 'Widok', menuActions: 'Działania' }}
            actions={[preview, save, remove]}
          />
        }
      />,
    );
    const menu = openMenu('Więcej');
    expect(within(menu).getAllByRole('group')).toHaveLength(2);
    expect(within(menu).getByRole('group', { name: 'Widok' })).toBeTruthy();
    expect(within(menu).getByRole('group', { name: 'Działania' })).toBeTruthy();
    expect(within(menu).getByText('Widok')).toBeTruthy();
    expect(
      within(menu).getAllByRole('menuitem').length +
        within(menu).getAllByRole('menuitemcheckbox').length,
    ).toBe(3);
  });

  it('keeps the flat menu for a default header', () => {
    render(
      <CompactWorkspaceActions
        header={<WorkspaceHeader title="Doc" actions={[preview, save]} />}
      />,
    );
    const menu = openMenu();
    expect(menu.querySelector('[role="group"]')).toBeNull();
  });
});
