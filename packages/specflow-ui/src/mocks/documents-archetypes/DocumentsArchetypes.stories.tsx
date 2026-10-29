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

/* 1. Documents tree and overview state */
export const TreeWide: Story = {};
export const TreeWideNothingToReport: Story = { args: { scenario: 'clean' } };
export const TreeWideRowMenuOverview: Story = { args: { scenario: 'row-menu' } };
export const TreeWideReadOnly: Story = { args: { scenario: 'read-only-tree' } };
export const NewDocumentWide: Story = { args: { scenario: 'new-document' } };
export const AssignTypeWide: Story = { args: { scenario: 'assign-type' } };
export const TreeCompact900: Story = { args: { width: 900 } };
/** State labels (No type, File missing) stay; the name truncates. */
export const TreeCompact860: Story = { args: { width: 860 } };
export const TreeNarrow390: Story = { args: { width: 390, height: 844, narrowPage: 'tree' } };
export const NewDocumentNarrow390: Story = {
  args: { width: 390, height: 844, narrowPage: 'tree', scenario: 'new-document' },
};

/* 3. Document editor and tab states */
export const EditorReadOnlyWide: Story = { args: { scenario: 'read-only' } };
export const EditorSavingWide: Story = { args: { scenario: 'saving' } };
export const EditorConflictWide: Story = { args: { scenario: 'conflict' } };
export const EditorImageWide: Story = { args: { scenario: 'image' } };
export const EditorBinaryWide: Story = { args: { scenario: 'binary' } };
export const EditorDanglingWide: Story = { args: { scenario: 'dangling' } };
export const EditorConflictCompact900: Story = { args: { width: 900, scenario: 'conflict' } };
export const EditorReadOnlyNarrow390: Story = {
  args: { width: 390, height: 844, scenario: 'read-only', narrowPage: 'document' },
};
export const EditorBinaryNarrow390: Story = {
  args: { width: 390, height: 844, scenario: 'binary', narrowPage: 'document' },
};

/* 2. Create specification */
/** Opens on the default archetype (minimal, Q1). */
export const CreateWide: Story = {
  render: (args) => <CreateMock width={args.width} height={1100} scenario="form" />,
};
/** The user chose Feature: its suggested documents with the preselected ticks. */
export const CreateWideFeature: Story = {
  render: (args) => <CreateMock width={args.width} height={1500} scenario="feature" />,
};
export const CreateOwnerRequirementWide: Story = {
  render: (args) => <CreateMock width={args.width} height={1500} scenario="owner-requirement" />,
};
export const CreateCompact900: Story = {
  render: () => <CreateMock width={900} height={1500} scenario="form" />,
};
export const CreateNarrow390: Story = {
  render: () => <CreateMock width={390} height={1900} scenario="feature" />,
};
export const CreateProgressConfigurationWide: Story = {
  render: (args) => <CreateMock width={args.width} height={900} scenario="progress" />,
};
export const CreateProgressConfigurationNarrow390: Story = {
  render: () => <CreateMock width={390} height={844} scenario="progress" />,
};
