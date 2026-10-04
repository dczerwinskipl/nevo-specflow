import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './Skeleton';
const meta = {
  title: 'Nevo UI/Feedback/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <Skeleton className="h-5 w-64" /> };
