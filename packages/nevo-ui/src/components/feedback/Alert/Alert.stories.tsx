import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatusTone } from '../../../design-system/statusTone';
import { Alert } from './Alert';

const meta = {
  title: 'Nevo UI/Feedback/Alert',
  component: Alert,
  tags: ['autodocs'],
  args: {
    title: 'Import completed',
    children: '42 records were processed successfully.',
    tone: 'success',
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="grid max-w-xl gap-3">
      {(
        [
          'neutral',
          'info',
          'success',
          'attention',
          'danger',
        ] as const satisfies readonly StatusTone[]
      ).map((tone) => (
        <Alert {...args} key={tone} tone={tone} title={`${tone} alert`} />
      ))}
    </div>
  ),
};

export const AssertiveAnnouncement: Story = {
  args: {
    role: 'alert',
    tone: 'danger',
    title: 'Import failed',
    children: 'The import stopped before any records were changed.',
  },
};
