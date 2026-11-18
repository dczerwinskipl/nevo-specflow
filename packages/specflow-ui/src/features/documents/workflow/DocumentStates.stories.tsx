import type { DocumentContentState } from '@nevo/specflow-contracts/documents';
import type { DocumentRelation } from '@nevo/specflow-contracts/workflow';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { TooltipProvider } from '@nevo/ui';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { TreeDocumentRow, TreeLevel } from '../../../shared/document-tree';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { DocumentsExplorer } from '../explorer/DocumentsExplorer';
import { protectedActions } from '../explorer/DocumentsExplorer.stories-support';
import { documentRelations, documentStateLabel } from './documentState';
import { useDocumentStateRow } from './useDocumentStateRow';

/*
 * The one document state vocabulary (A6, owner decision 2026-11-18): the content state and the
 * relation to the workflow are separate facts, named together only when both apply. The same
 * fixture as the Overview's "write-spec-gate" state, on the shared row and on the Documents tree.
 */

const scope = { kind: 'specification', specId: 'sso-sign-in' } as const;
const write = { id: 'specification', title: 'Write the specification', active: true };
const design = { id: 'solution', title: 'Design the solution', active: false };

const relation = (
  documentId: string,
  kind: DocumentRelation['relation'],
  blocksNow: boolean,
  step: DocumentRelation['step'],
  missingSections?: string[],
): DocumentRelation => ({
  scope,
  documentId,
  relation: kind,
  blocksNow,
  step,
  gate: {
    id: `${documentId}-gate`,
    label: `${documentId}.md has an Acceptance section`,
    ...(missingSections ? { missingSections } : {}),
  },
});

/** Every combination the label function knows, in the section 6 order. */
const combinations: readonly {
  name: string;
  content?: DocumentContentState;
  relation?: DocumentRelation;
}[] = [
  {
    name: 'behaviour.md',
    content: 'baseline',
    relation: relation('behaviour', 'needed-to-finish', true, write, ['Acceptance']),
  },
  {
    name: 'acceptance.md',
    content: 'authored',
    relation: relation('acceptance', 'needed-to-finish', true, write, ['Acceptance']),
  },
  {
    name: 'ux.md',
    content: 'baseline',
    relation: relation('ux', 'needed-to-start', false, design),
  },
  {
    name: 'backend.md',
    content: 'authored',
    relation: relation('backend', 'needed-to-start', false, design),
  },
  {
    name: 'overview.md',
    content: 'authored',
    relation: relation('overview', 'used', false, write),
  },
  { name: 'decisions.md', content: 'baseline' },
  { name: 'notes.md', content: 'authored' },
];

function LabelTable({ stepOnScreen, width }: { stepOnScreen: boolean; width: number }) {
  const stateRow = useDocumentStateRow();

  return (
    <TooltipProvider>
      <div style={{ padding: 16, width, maxWidth: '100%' }}>
        <TreeLevel top flat>
          {combinations.map((entry) => {
            const state = stateRow(
              documentStateLabel(entry.content, entry.relation, { stepOnScreen }),
            );

            return (
              <TreeDocumentRow
                key={entry.name}
                name={entry.name}
                state={state.state}
                details={state.details}
                current={false}
                onOpen={() => undefined}
              />
            );
          })}
        </TreeLevel>
      </div>
    </TooltipProvider>
  );
}

const meta = {
  title: 'SpecFlow/Features/Document states',
  component: LabelTable,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  args: { stepOnScreen: true, width: 720 },
} satisfies Meta<typeof LabelTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Overview and Task detail: the active step is on screen, so its gates read "this step". */
export const StepOnScreen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Initial content only · needed to finish this step'),
    ).toBeVisible();
    await expect(canvas.getByText('Needed to finish this step')).toBeVisible();
    await expect(
      canvas.getByText('Initial content only · needed to start Design the solution'),
    ).toBeVisible();
    await expect(canvas.getByText('Needed to start Design the solution')).toBeVisible();
    await expect(canvas.getByText('Used in this step')).toBeVisible();
    await expect(canvas.getByText('Initial content only')).toBeVisible();
    // An authored document no gate names carries no label.
    await expect(canvas.getByRole('button', { name: 'notes.md' })).toHaveTextContent(/^notes\.md$/);
  },
};

/** The Documents page: the step is not on screen, so every relation names it. */
export const StepNamed: Story = {
  args: { stepOnScreen: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Needed to finish Write the specification')).toBeVisible();
    await expect(canvas.getByText('Used in Write the specification')).toBeVisible();
  },
};

/** A phone row: the relation drops its step ("Needed to finish"); the tooltip keeps the full label. */
export const Narrow: Story = {
  args: { width: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Initial content · needed to finish')).toBeVisible();
    await expect(canvas.getByText('Needed to finish')).toBeVisible();
    await expect(canvas.getByText('Initial content · needed to start')).toBeVisible();
    await expect(canvas.getByText('Needed to finish this step')).not.toBeVisible();
  },
};

/** The Documents page tree with the Overview's "write-spec-gate" fixture, at its width. */
const gateTree = documentTreeFixture({
  documents: (
    [
      ['overview', 'authored'],
      ['behaviour', 'authored'],
      ['ux', 'baseline'],
      ['backend', 'authored'],
      ['decisions', 'baseline'],
    ] as const
  ).map(([id, contentState]) => ({
    id,
    path: `${id}.md`,
    type: id,
    contentState,
    ...(id === 'overview' ? { protected: true, actions: protectedActions } : {}),
  })),
});
const gateRelations = documentRelations(
  [
    relation('behaviour', 'needed-to-finish', true, write, ['Acceptance']),
    relation('ux', 'needed-to-start', false, design),
  ],
  scope,
);

const renderTree =
  (width: number, relationsUnavailable = false) =>
  () => (
    <NotificationProvider>
      <div style={{ padding: 16, width, maxWidth: '100%' }}>
        <DocumentsExplorer
          tree={gateTree}
          relations={relationsUnavailable ? new Map() : gateRelations}
          relationsUnavailable={relationsUnavailable}
          onSelect={() => undefined}
          onAdd={() => Promise.resolve()}
          onOperate={() => Promise.resolve()}
        />
      </div>
    </NotificationProvider>
  );

/** The Documents tree beside the Overview: the same document reads the same, with the step named. */
export const DocumentsTree: Story = {
  render: renderTree(560),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Needed to finish Write the specification')).toBeVisible();
    await expect(
      canvas.getByText('Initial content only · needed to start Design the solution'),
    ).toBeVisible();
    await expect(canvas.getByText('Initial content only')).toBeVisible();
  },
};

/**
 * The Documents tree in a phone-width pane: the step is not on screen, so a label keeps it; one
 * that does not fit beside the name takes its own line, cut at the end (the tooltip has it all).
 */
export const DocumentsTreeNarrow: Story = {
  render: renderTree(390),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const label = await canvas.findByText(
      'Initial content only · needed to start Design the solution',
    );
    await expect(label).toBeVisible();
    const name = canvas.getByText('ux.md');
    // Under the name, not beside it; the name is not cut.
    await expect(label.getBoundingClientRect().top).toBeGreaterThan(
      name.getBoundingClientRect().bottom - 1,
    );
    await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
    // A label that fits stays beside the name.
    const short = canvas.getByText('Initial content only');
    await expect(
      Math.abs(
        short.getBoundingClientRect().top -
          canvas.getByText('decisions.md').getBoundingClientRect().top,
      ),
    ).toBeLessThan(4);
  },
};

/** A workflow without document gates (the shipped ones): content states only, no note. */
export const DocumentsTreeWithoutGates: Story = {
  render: () => (
    <NotificationProvider>
      <div style={{ padding: 16, width: 560, maxWidth: '100%' }}>
        <DocumentsExplorer
          tree={gateTree}
          relations={new Map()}
          onSelect={() => undefined}
          onAdd={() => Promise.resolve()}
          onOperate={() => Promise.resolve()}
        />
      </div>
    </NotificationProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText('Initial content only')).toHaveLength(2);
    await expect(canvas.queryByText(/needed to|used in/i)).toBeNull();
    await expect(canvas.queryByText(/requirements could not be loaded/)).toBeNull();
  },
};

/** The projection could not be read: content states only, and a quiet note says so. */
export const DocumentsTreeRelationsUnavailable: Story = {
  render: renderTree(560, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        "The workflow's requirements could not be loaded, so the documents a step needs are not marked.",
      ),
    ).toBeVisible();
    await expect(canvas.getAllByText('Initial content only')).toHaveLength(2);
    await expect(canvas.queryByText(/needed to/i)).toBeNull();
  },
};
