import type { Meta, StoryObj } from '@storybook/react-vite';
import { CreateMock } from './CreateMock.stories-support';
import { DocumentsMock } from './DocumentsMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/documents-archetypes-ui.md).
 * Not production code: static data, no routing, no backend. Not responsive: every story pins one
 * frame width (1440 wide, 900 compact, 390 narrow). No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Documents archetypes (mock)',
  component: DocumentsMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { width: 1440, height: 900, scenario: 'overview' },
} satisfies Meta<typeof DocumentsMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Default: the wide tree and overview; the Controls switch the scenario and the frame. */
export const Default: Story = {
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'overview',
        'clean',
        'read-only-tree',
        'new-document',
        'assign-type',
        'row-menu',
        'read-only',
        'saving',
        'conflict',
        'image',
        'binary',
        'dangling',
      ],
    },
    width: { control: { type: 'number', min: 320, max: 1600, step: 10 } },
    height: { control: { type: 'number', min: 360, max: 1200, step: 10 } },
    narrowPage: { control: 'inline-radio', options: ['tree', 'document'] },
  },
};

/* 1. Documents tree and overview state */
export const TreeWide: Story = { tags: ['capture'] };
export const TreeWideNothingToReport: Story = { tags: ['capture'], args: { scenario: 'clean' } };
export const TreeWideRowMenuOverview: Story = { tags: ['capture'], args: { scenario: 'row-menu' } };
export const TreeWideReadOnly: Story = { tags: ['capture'], args: { scenario: 'read-only-tree' } };
export const NewDocumentWide: Story = { tags: ['capture'], args: { scenario: 'new-document' } };
export const AssignTypeWide: Story = { tags: ['capture'], args: { scenario: 'assign-type' } };
export const TreeCompact900: Story = { tags: ['capture'], args: { width: 900 } };
/** State labels (No type, File missing) stay; the name truncates. */
export const TreeCompact860: Story = { tags: ['capture'], args: { width: 860 } };
export const TreeNarrow390: Story = {
  tags: ['capture'],
  args: { width: 390, height: 844, narrowPage: 'tree' },
};
export const NewDocumentNarrow390: Story = {
  tags: ['capture'],
  args: { width: 390, height: 844, narrowPage: 'tree', scenario: 'new-document' },
};

/* 3. Document editor and tab states */
export const EditorReadOnlyWide: Story = { tags: ['capture'], args: { scenario: 'read-only' } };
export const EditorSavingWide: Story = { tags: ['capture'], args: { scenario: 'saving' } };
export const EditorConflictWide: Story = { tags: ['capture'], args: { scenario: 'conflict' } };
export const EditorImageWide: Story = { tags: ['capture'], args: { scenario: 'image' } };
export const EditorBinaryWide: Story = { tags: ['capture'], args: { scenario: 'binary' } };
export const EditorDanglingWide: Story = { tags: ['capture'], args: { scenario: 'dangling' } };
export const EditorConflictCompact900: Story = {
  tags: ['capture'],
  args: { width: 900, scenario: 'conflict' },
};
export const EditorReadOnlyNarrow390: Story = {
  tags: ['capture'],
  args: { width: 390, height: 844, scenario: 'read-only', narrowPage: 'document' },
};
export const EditorBinaryNarrow390: Story = {
  tags: ['capture'],
  args: { width: 390, height: 844, scenario: 'binary', narrowPage: 'document' },
};

/* 2. Create specification */
/** Opens on the default archetype (minimal, Q1). */
export const CreateWide: Story = {
  tags: ['capture'],
  render: (args) => <CreateMock width={args.width} height={1100} scenario="form" />,
};
/** The user chose Feature: its suggested documents with the preselected ticks. */
export const CreateWideFeature: Story = {
  tags: ['capture'],
  render: (args) => <CreateMock width={args.width} height={1500} scenario="feature" />,
};
export const CreateOwnerRequirementWide: Story = {
  tags: ['capture'],
  render: (args) => <CreateMock width={args.width} height={1500} scenario="owner-requirement" />,
};
export const CreateCompact900: Story = {
  tags: ['capture'],
  render: () => <CreateMock width={900} height={1500} scenario="form" />,
};
export const CreateNarrow390: Story = {
  tags: ['capture'],
  render: () => <CreateMock width={390} height={1900} scenario="feature" />,
};
export const CreateProgressConfigurationWide: Story = {
  tags: ['capture'],
  render: (args) => <CreateMock width={args.width} height={900} scenario="progress" />,
};
export const CreateProgressConfigurationNarrow390: Story = {
  tags: ['capture'],
  render: () => <CreateMock width={390} height={844} scenario="progress" />,
};
