import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineNote } from './InlineNote';

const meta = {
  title: 'Nevo UI/Feedback/InlineNote',
  component: InlineNote,
  tags: ['autodocs'],
  args: {
    children: 'Other specifications already use this folder, so changes and history are shared.',
  },
  parameters: {
    docs: {
      description: {
        component:
          'A short explanatory sentence with a leading icon and no container. The quiet counterpart of Alert for a fact or caveat that belongs to the content next to it.',
      },
    },
  },
} satisfies Meta<typeof InlineNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Attention: Story = {
  args: {
    tone: 'attention',
    children: 'The workspace has unsaved changes that stay where they are.',
  },
};

export const LongTextWraps: Story = {
  render: (args) => (
    <div className="w-64">
      <InlineNote {...args}>
        A long explanation that has to wrap inside a narrow column without pushing the icon out of
        the way or overflowing horizontally: feature/payments/very-long-branch-name-for-wrapping.
      </InlineNote>
    </div>
  ),
};
