import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import { EditorModeMock } from './EditorModeMock.stories-support';
import { SessionsHostMock } from './SessionsHostMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (Storybook design validation). Not production code: no routing, no
 * editor engine, no backend, static data. Not responsive: every story pins one frame width.
 * No Chromatic snapshots (the host default disables them). Variant A only (strip in the header).
 */
const meta = {
  title: 'SpecFlow/Screens/Editor mode (mock)',
  component: EditorModeMock,
  parameters: { layout: 'fullscreen' },
  args: { width: 1440, height: 900, preset: 'mixed' },
  argTypes: {
    width: { control: { type: 'number', min: 320, max: 1600, step: 10 } },
    preset: { control: 'inline-radio', options: ['mixed', 'empty'] },
    active: {
      control: 'select',
      options: ['specification', 'decisions', 'auth-service', 'architecture-png'],
    },
    activeView: { control: 'inline-radio', options: ['preview', 'edit', 'split'] },
    narrowPage: { control: 'inline-radio', options: ['tree', 'document'] },
  },
} satisfies Meta<typeof EditorModeMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the Opened menu through the user path. Modal menus aria-hide the page: axe is off. */
const menuOpen = { a11y: { test: 'off' as const } };
const openOpenedMenu: Story['play'] = async ({ canvas, userEvent }) => {
  await userEvent.click(await canvas.findByRole('button', { name: /Opened/ }));
  await within(document.body).findByRole('menu');
};

/* Wide 1440. Each tab keeps its own view: specification = markdown preview, decisions = markdown
   edit, AuthService.cs = code view, architecture.png = image. */
export const WideMarkdownView: Story = {};
export const WideMarkdownEdit: Story = { args: { active: 'decisions' } };
export const WideCodeView: Story = { args: { active: 'auth-service' } };
export const WideImage: Story = { args: { active: 'architecture-png' } };
export const WideOverflowMenu: Story = { parameters: menuOpen, play: openOpenedMenu };
export const WideUnsavedChangesDialog: Story = { args: { dialog: true } };
export const WideEmptyState: Story = { args: { preset: 'empty' } };

/* Split view (markdown, document area >= 1000px): 1920 has it, 1440 does not. */
// Opens in preview like everywhere; the initial split is only set through args to show it.
export const Wide1920Split: Story = {
  args: { width: 1920, active: 'specification', activeView: 'split' },
};
export const Wide1920EditOnly: Story = {
  args: { width: 1920, active: 'decisions', activeView: 'edit' },
};

/* Compact: 8 tabs. */
export const Compact900: Story = { args: { width: 900 } };
export const Compact1108: Story = { args: { width: 1108 } };

/* Tablet threshold comparison: splits below 840 (the product stacks) next to the current stack. */
export const Split770Tree240: Story = {
  name: 'Proposal - Split 770 tree 240',
  parameters: {
    docs: {
      description: {
        story: 'Proposal: lower editor split threshold (not adopted; shell threshold stays 840).',
      },
    },
  },
  args: { width: 770, splitOverride: true, treeWidth: 240, active: 'decisions' },
};
export const Split800Tree280: Story = {
  name: 'Proposal - Split 800 tree 280',
  parameters: {
    docs: {
      description: {
        story: 'Proposal: lower editor split threshold (not adopted; shell threshold stays 840).',
      },
    },
  },
  args: { width: 800, splitOverride: true, treeWidth: 280, active: 'decisions' },
};
export const Tablet768: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Current stacked model at 768, shown next to the Proposal: lower editor split threshold (not adopted; shell threshold stays 840).',
      },
    },
  },
  args: { width: 768, height: 1000 },
};

/* Narrow 390 (stacked): tree page, document pages, Opened menu. */
export const Narrow390Tree: Story = { args: { width: 390, height: 844 } };
export const Narrow390MarkdownView: Story = {
  args: { width: 390, height: 844, narrowPage: 'document' },
};
export const Narrow390MarkdownEdit: Story = {
  args: { width: 390, height: 844, narrowPage: 'document', active: 'decisions' },
};
export const Narrow390Code: Story = {
  args: { width: 390, height: 844, narrowPage: 'document', active: 'auth-service' },
};
export const Narrow390Image: Story = {
  args: { width: 390, height: 844, narrowPage: 'document', active: 'architecture-png' },
};
export const Narrow390OpenedMenu: Story = {
  args: { width: 390, height: 844, narrowPage: 'document' },
  parameters: menuOpen,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /opened/ }));
    await within(document.body).findByRole('menu');
  },
};

/* Host independence: the same strip in a Sessions Secondary (read-only previews). */
export const SessionsHost: Story = {
  render: (args) => <SessionsHostMock width={args.width} height={args.height} />,
};
export const SessionsHostContextPlaceholder: Story = {
  render: (args) => <SessionsHostMock width={args.width} height={args.height} empty />,
};
