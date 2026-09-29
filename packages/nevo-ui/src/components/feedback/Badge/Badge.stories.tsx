import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatusTone } from '../../../design-system/statusTone';
import { WorkspaceSurfacePreview } from '../../foundations/Environment';
import { Badge } from './Badge';

const meta = {
  title: 'Nevo UI/Feedback/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <WorkspaceSurfacePreview className="flex items-center justify-center">
        <Story />
      </WorkspaceSurfacePreview>
    ),
  ],
  args: { children: 'Active', tone: 'success' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(
        [
          'neutral',
          'info',
          'success',
          'attention',
          'danger',
        ] as const satisfies readonly StatusTone[]
      ).map((tone) => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};
