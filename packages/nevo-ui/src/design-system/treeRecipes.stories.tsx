import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, IconButton, Menu, MenuContent, MenuItem, MenuTrigger } from '../components';
import {
  treeBranchClassName,
  treeGlyphSlotClassName,
  treeHintClassName,
  treeItemClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRequiredLabelClassName,
  treeRequiredMarkerClassName,
  treeRootClassName,
  treeAttentionGlyphClassName,
  treeAttentionStateLabelClassName,
  treeRowActionClassName,
  treeRowClassName,
  treeSectionHeaderClassName,
  treeStateLabelClassName,
} from './treeRecipes';

type TreeEntry =
  | { kind: 'folder'; name: string; children: TreeEntry[] }
  | {
      kind: 'file';
      name: string;
      required?: boolean;
      disabled?: boolean;
      /** Trailing label: a state label or an attention state label (they never hide). */
      trailing?: { text: string; kind: 'state' | 'attention' };
    };

const longName = 'adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md';

/** Natural explorer order: folders A-Z, then files A-Z, at every level; required never reorders. */
const fixture: TreeEntry[] = [
  {
    kind: 'folder',
    name: 'architektura',
    children: [
      { kind: 'folder', name: 'decyzje', children: [{ kind: 'file', name: longName }] },
      { kind: 'file', name: 'kontekst-systemu.md' },
    ],
  },
  {
    kind: 'folder',
    name: 'badania',
    children: [{ kind: 'file', name: 'porownanie-dostawcow.md' }],
  },
  { kind: 'folder', name: 'notatki', children: [] },
  { kind: 'file', name: 'archiwum.md', disabled: true },
  { kind: 'file', name: 'specification.md', required: true },
];

const nothing: string[] = [];

function RowAction({ name }: { name: string }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          aria-label={`Actions for ${name}`}
          className={treeRowActionClassName}
          icon="ellipsis"
          size="sm"
        />
      </MenuTrigger>
      <MenuContent aria-label={`Actions for ${name}`}>
        <MenuItem>Rename</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function TreeLevel({
  entries,
  parent,
  closed,
  selected,
  toggle,
  top,
}: {
  entries: TreeEntry[];
  parent: string;
  closed: string[];
  selected: string[];
  toggle: (path: string) => void;
  top?: boolean;
}) {
  // A top level without folders is flat: its leaves have no folder icon column to align with.
  const flat = top && entries.every((entry) => entry.kind === 'file');

  return (
    <ul
      className={top ? treeRootClassName : treeBranchClassName}
      data-tree-branch={parent || 'root'}
    >
      {entries.map((entry) => {
        const path = parent ? `${parent}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          return (
            <li className={treeNodeClassName} key={path}>
              <div className={treeRowClassName}>
                <button
                  aria-current={selected.includes(path) ? 'true' : undefined}
                  className={flat ? treeItemClassName : treeLeafItemClassName}
                  data-tree-item={path}
                  data-tree-leaf
                  disabled={entry.disabled}
                  type="button"
                >
                  {entry.trailing?.kind === 'attention' ? (
                    <Icon name="triangle-alert" className={treeAttentionGlyphClassName} />
                  ) : (
                    <Icon name="file" />
                  )}
                  <span className={treeItemLabelTruncateClassName}>{entry.name}</span>
                  {entry.trailing && (
                    <span
                      className={
                        entry.trailing.kind === 'state'
                          ? treeStateLabelClassName
                          : treeAttentionStateLabelClassName
                      }
                    >
                      {entry.trailing.text}
                    </span>
                  )}
                  {entry.required && (
                    <>
                      <span className={treeRequiredLabelClassName}>Required</span>
                      <span aria-hidden className={treeRequiredMarkerClassName}>
                        <Icon name="workflow" size="sm" />
                      </span>
                    </>
                  )}
                </button>
                <RowAction name={entry.name} />
              </div>
            </li>
          );
        }

        const empty = entry.children.length === 0;
        const expanded = empty ? closed.includes(`open:${path}`) : !closed.includes(path);

        return (
          <li className={treeNodeClassName} key={path}>
            <div className={treeRowClassName}>
              <button
                aria-expanded={expanded}
                className={treeItemClassName}
                data-tree-item={path}
                onClick={() => toggle(empty ? `open:${path}` : path)}
                type="button"
              >
                <span className={treeGlyphSlotClassName} data-tree-chevron={path}>
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
                </span>
                <Icon name="folder" />
                <span className={treeItemLabelTruncateClassName}>{entry.name}</span>
              </button>
              <RowAction name={entry.name} />
            </div>
            {expanded && !empty && (
              <TreeLevel
                closed={closed}
                entries={entry.children}
                parent={path}
                selected={selected}
                toggle={toggle}
              />
            )}
            {expanded && empty && (
              <p className={treeHintClassName} data-testid="hint">
                Folder is empty. Add a file or folder from the menu.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Trailing state labels: they never hide, the name truncates instead. */
const labelledFixture: TreeEntry[] = [
  {
    kind: 'folder',
    name: 'notes',
    children: [
      { kind: 'file', name: 'login-flow.md' },
      {
        kind: 'file',
        name: 'meeting-2026-10-20-with-the-identity-team.md',
        trailing: { text: 'Read-only', kind: 'state' },
      },
    ],
  },
  { kind: 'file', name: 'backend.md', trailing: { text: 'File missing', kind: 'attention' } },
  { kind: 'file', name: 'overview.md' },
];

function TreeExample({
  selected = nothing,
  width = 'w-full max-w-sm',
  opened = nothing,
  entries = fixture,
  header,
}: {
  selected?: string[];
  width?: string;
  opened?: string[];
  entries?: TreeEntry[];
  /** The root section header (the tree's own title). */
  header?: string;
}) {
  const [closed, setClosed] = useState<string[]>(opened);
  const toggle = (path: string) =>
    setClosed((value) =>
      value.includes(path) ? value.filter((item) => item !== path) : [...value, path],
    );

  return (
    <nav aria-label="Documents" className={`${width} min-w-0`}>
      {header && (
        <div className={treeSectionHeaderClassName} data-tree-header>
          <span className="min-w-0 flex-1 truncate text-section-label uppercase text-content-muted">
            {header}
          </span>
        </div>
      )}
      <TreeLevel
        closed={closed}
        entries={entries}
        parent=""
        selected={selected}
        toggle={toggle}
        top
      />
    </nav>
  );
}

const meta = {
  title: 'Nevo UI/Foundations/TreeGuide',
  component: TreeExample,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TreeExample>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No row is selected until a document is open. */
export const Default: Story = {};
/** The opened document is the only selected row (nested file). */
export const SelectedNestedFile: Story = {
  args: { selected: [`architektura/decyzje/${longName}`] },
};
export const SelectedRequiredFile: Story = { args: { selected: ['specification.md'] } };
/** An opened empty folder shows the quiet hint, not a tree item. */
export const EmptyFolderOpened: Story = { args: { opened: ['open:notatki'] } };
/** State labels never hide: the name truncates instead. */
export const TrailingLabels: Story = { args: { entries: labelledFixture } };
export const TrailingLabelsNarrow: Story = {
  args: { entries: labelledFixture, width: 'w-[15rem]' },
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const row = (key: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-tree-item="${key}"]`)!;
    const missing = row('backend.md');
    const state = Array.from(missing.querySelectorAll('span')).find(
      (span) => span.textContent === 'File missing',
    );
    if (!state || state.getBoundingClientRect().width === 0) {
      throw new Error('A state label stays visible on a narrow row.');
    }

    const stateRow = row('notes/meeting-2026-10-20-with-the-identity-team.md');
    const readOnly = Array.from(stateRow.querySelectorAll('span')).find(
      (span) => span.textContent === 'Read-only',
    );
    if (
      !readOnly ||
      readOnly.getBoundingClientRect().right > stateRow.getBoundingClientRect().right
    ) {
      throw new Error('A long name truncates so the state label stays inside the row.');
    }
  },
};

/** The open (selected) missing row keeps the attention tone on its warning glyph. */
export const SelectedMissingRowKeepsItsWarning: Story = {
  args: { entries: labelledFixture, selected: ['backend.md'] },
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector<HTMLElement>('[data-tree-item="backend.md"]')!;
    const glyph = row.querySelector('svg')!;
    const label = Array.from(row.querySelectorAll('span')).find(
      (span) => span.textContent === 'File missing',
    )!;
    if (getComputedStyle(glyph).color !== getComputedStyle(label).color) {
      throw new Error('The warning glyph keeps the attention tone on the selected row.');
    }
  },
};
/** Files only: the root section header names the tree and the files are not indented. */
const flatFixture: TreeEntry[] = [
  { kind: 'file', name: 'behaviour.md' },
  { kind: 'file', name: 'overview.md' },
  { kind: 'file', name: 'ux.md' },
];
export const FlatWithSectionHeader: Story = {
  args: { entries: flatFixture, header: 'Project files' },
};
export const FlatWithSectionHeaderGeometry: Story = {
  args: { entries: flatFixture, header: 'Project files' },
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>('[data-tree-header]')!;
    const title = header.querySelector('span')!.getBoundingClientRect();
    const file = item(canvasElement, 'overview.md');
    assert(
      near(file.querySelector('svg')!.getBoundingClientRect().left, title.left),
      'A flat file starts on the header text edge: it does not look nested.',
    );
    assert(
      near(header.getBoundingClientRect().height, file.getBoundingClientRect().height, 1),
      'The header is one row high.',
    );
  },
};
/** With a folder the files keep the offset that aligns them with the folder icon. */
export const SectionHeaderWithFolders: Story = {
  args: { header: 'Project files' },
};
export const Narrow: Story = {
  args: { selected: [`architektura/decyzje/${longName}`], width: 'w-full' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const near = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const px = (value: string) => Number.parseFloat(value);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const item = (root: HTMLElement, key: string) =>
  root.querySelector<HTMLElement>(`[data-tree-item="${key}"]`)!;
const label = (element: HTMLElement) => element.querySelector<HTMLElement>(':scope > .truncate')!;
const adrKey = `architektura/decyzje/${longName}`;

/** Compact rows, small token indents, no guide lines, aligned chevron/icon/name columns. */
function verifyCompactGeometry(root: HTMLElement) {
  const rootDoc = document.documentElement;
  const compact =
    px(getComputedStyle(rootDoc).getPropertyValue('--spacing-control-height-compact')) *
    px(getComputedStyle(rootDoc).fontSize);
  const rows = [...root.querySelectorAll<HTMLElement>('[data-tree-item]')];
  assert(rows.length >= 8, 'The fixture renders nested rows.');
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    assert(near(rect.height, compact, 1), `Rows are one compact control height (${rect.height}).`);
    const parentRow = row.parentElement!;
    assert(getComputedStyle(parentRow, '::before').content === 'none', 'No trunk guide.');
    assert(getComputedStyle(parentRow, '::after').content === 'none', 'No elbow guide.');
    assert(
      getComputedStyle(row.closest('li')!, '::before').content === 'none',
      'No pass-through guide.',
    );
  }

  // Consecutive rows touch: no gaps between rows.
  const first = item(root, 'architektura').getBoundingClientRect();
  const second = item(root, 'architektura/decyzje').getBoundingClientRect();
  assert(near(second.top, first.bottom, 1), 'Rows are packed without gaps.');

  // One small indent step per level, and the leaf icon aligns with sibling folder icons.
  const iconLeft = (key: string) =>
    item(root, key).querySelector('svg')!.getBoundingClientRect().left;
  const chevron = (key: string) =>
    root.querySelector<HTMLElement>(`[data-tree-chevron="${key}"]`)!.getBoundingClientRect().left;
  const step = chevron('architektura/decyzje') - chevron('architektura');
  const slot = px(
    getComputedStyle(root.querySelector(`[data-tree-chevron="architektura"]`)!).width,
  );
  assert(near(step, slot), `The indent step is one glyph slot (${step} vs ${slot}).`);
  const folderIconLeft = (key: string) =>
    item(root, key).querySelectorAll('svg')[1]!.getBoundingClientRect().left;
  assert(
    near(iconLeft('architektura/kontekst-systemu.md'), folderIconLeft('architektura/decyzje')),
    'A leaf icon aligns with sibling folder icons.',
  );
  assert(
    near(iconLeft('specification.md'), folderIconLeft('architektura')),
    'A top-level leaf icon aligns with top-level folder icons.',
  );
}

function verifyLongNameKeepsWidth(root: HTMLElement) {
  const long = item(root, adrKey);
  const text = label(long);
  assert(text.scrollWidth > text.clientWidth, 'A long name is ellipsised on one line.');
  assert(
    text.getBoundingClientRect().width >= long.getBoundingClientRect().width * 0.5,
    'The third level keeps most of the width.',
  );
  assert(
    near(
      long.getBoundingClientRect().height,
      item(root, 'architektura').getBoundingClientRect().height,
      1,
    ),
    'A truncated row stays one line high.',
  );
  const nav = root.querySelector('nav')!;
  assert(nav.scrollWidth <= nav.clientWidth, 'No horizontal overflow.');
}

function verifySelectionIsOnlyTheOpenedItem(root: HTMLElement, expected: string[]) {
  const current = [...root.querySelectorAll<HTMLElement>('[aria-current="true"]')].map(
    (element) => element.dataset.treeItem,
  );
  assert(
    JSON.stringify(current) === JSON.stringify(expected),
    `Only the opened item is selected (${JSON.stringify(current)}).`,
  );
  const idle = getComputedStyle(item(root, 'badania')).backgroundColor;
  for (const key of expected) {
    const selected = item(root, key);
    assert(
      getComputedStyle(selected).backgroundColor !== idle,
      'The current row is visibly selected.',
    );
    assert(
      getComputedStyle(selected.querySelector('svg')!).color !==
        getComputedStyle(item(root, 'badania').querySelector('svg')!).color,
      'The selected file icon carries the accent.',
    );
  }
}

export const CompactGeometryContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvasElement, canvas, userEvent }) => {
    verifyCompactGeometry(canvasElement);
    verifyLongNameKeepsWidth(canvasElement);
    verifySelectionIsOnlyTheOpenedItem(canvasElement, []);
    await userEvent.click(canvas.getByRole('button', { name: 'decyzje' }));
    assert(
      canvas.getByRole('button', { name: 'decyzje' }).getAttribute('aria-expanded') === 'false',
      'Folders disclose.',
    );
  },
};

export const NarrowCompactGeometryContract: Story = {
  tags: ['contract', '!autodocs'],
  args: Narrow.args,
  play: async ({ canvasElement }) => {
    verifyCompactGeometry(canvasElement);
    verifyLongNameKeepsWidth(canvasElement);
    verifySelectionIsOnlyTheOpenedItem(canvasElement, [adrKey]);
  },
  globals: Narrow.globals,
};

export const SelectedRowsContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { selected: ['specification.md'] },
  play: async ({ canvasElement }) => {
    verifySelectionIsOnlyTheOpenedItem(canvasElement, ['specification.md']);
    const required = item(canvasElement, 'specification.md');
    const text = required.querySelector<HTMLElement>(`.${CSS.escape('whitespace-nowrap')}`)!;
    assert(text.textContent === 'Required', 'The required marker keeps its accessible text.');
    assert(
      getComputedStyle(text).backgroundColor === 'rgba(0, 0, 0, 0)',
      'The required marker is quiet text, not a pill.',
    );
  },
};

export const EmptyFolderHintContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvasElement, canvas, userEvent }) => {
    const folder = canvas.getByRole('button', { name: 'notatki' });
    assert(!canvasElement.querySelector('[data-testid="hint"]'), 'No permanent empty-folder row.');
    assert(folder.getAttribute('aria-expanded') === 'false', 'An empty folder starts collapsed.');
    await userEvent.click(folder);
    const hint = canvasElement.querySelector<HTMLElement>('[data-testid="hint"]')!;
    assert(hint.textContent.startsWith('Folder is empty'), 'Opening shows the hint.');
    assert(!hint.querySelector('svg'), 'The hint has no icon.');
    assert(hint.tabIndex < 0 && hint.closest('button') === null, 'The hint is not focusable.');
    assert(hint.closest('ul') === folder.closest('ul'), 'The hint is not a tree item of its own.');
    const name = label(folder);
    const range = document.createRange();
    range.selectNodeContents(hint);
    assert(
      near(range.getBoundingClientRect().left, name.getBoundingClientRect().left, 1),
      'The hint aligns with the folder name column.',
    );
    await userEvent.click(folder);
    assert(!canvasElement.querySelector('[data-testid="hint"]'), 'Closing hides the hint.');
  },
};

export const RowActionsContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvasElement, userEvent }) => {
    const action = canvasElement.querySelector<HTMLElement>(
      `button[aria-label="Actions for ${longName}"]`,
    )!;
    const other = canvasElement.querySelector<HTMLElement>(
      'button[aria-label="Actions for badania"]',
    )!;
    const long = item(canvasElement, adrKey);
    const idleWidth = label(long).getBoundingClientRect().width;
    const box = action.getBoundingClientRect();

    assert(getComputedStyle(action).opacity === '0', 'The action is hidden at rest.');
    assert(box.width > 0 && box.height > 0, 'The hidden slot keeps its box.');
    assert(getComputedStyle(action).visibility === 'visible', 'The hidden action stays announced.');

    action.focus();
    await nextFrame();
    assert(getComputedStyle(action).opacity === '1', 'Keyboard focus reveals the action.');
    assert(
      near(label(long).getBoundingClientRect().width, idleWidth),
      'Focus does not reflow the label.',
    );
    action.blur();
    assert(getComputedStyle(other).opacity === '0', 'Other rows stay hidden.');

    await userEvent.click(action);
    await nextFrame();
    assert(action.getAttribute('data-state') === 'open', 'The menu opens from the action.');
    assert(getComputedStyle(action).opacity === '1', 'An open menu keeps the action visible.');
    await userEvent.keyboard('{Escape}');
  },
};

export const RequiredMarkerNarrowRow: Story = {
  tags: ['contract', '!autodocs'],
  args: { selected: ['specification.md'], width: 'w-60' },
  play: async ({ canvasElement }) => {
    const row = item(canvasElement, 'specification.md');
    const name = label(row);
    assert(name.scrollWidth <= name.clientWidth, 'The name stays readable on a narrow row.');
    const text = row.querySelector<HTMLElement>('.whitespace-nowrap')!;
    assert(text.getBoundingClientRect().width <= 1, 'The text is visually hidden.');
    assert(text.textContent === 'Required', 'The accessible text stays in the row.');
    const marker = row.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
    assert(getComputedStyle(marker).display !== 'none', 'The icon form stands in for it.');
  },
};

export const RequiredMarkerWideRow: Story = {
  tags: ['contract', '!autodocs'],
  args: { selected: [] },
  play: async ({ canvasElement }) => {
    const row = item(canvasElement, 'specification.md');
    const text = row.querySelector<HTMLElement>('.whitespace-nowrap')!;
    assert(text.getBoundingClientRect().width > 8, 'A wide row shows the muted text.');
    const marker = row.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
    assert(getComputedStyle(marker).display === 'none', 'The icon form is hidden when wide.');
    const action = canvasElement.querySelector<HTMLElement>(
      'button[aria-label="Actions for specification.md"]',
    )!;
    assert(
      text.getBoundingClientRect().right <= action.getBoundingClientRect().left,
      'The marker sits before the row menu.',
    );
  },
};

export const FoldersBeforeFilesContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvasElement }) => {
    const top = [
      ...canvasElement.querySelectorAll<HTMLElement>('[data-tree-branch="root"] > li'),
    ].map((li) => li.querySelector<HTMLElement>('[data-tree-item]')!.dataset.treeItem);
    assert(
      JSON.stringify(top) ===
        JSON.stringify(['architektura', 'badania', 'notatki', 'archiwum.md', 'specification.md']),
      `Folders A-Z, then files A-Z; the required file is not pinned (${JSON.stringify(top)}).`,
    );
  },
};
