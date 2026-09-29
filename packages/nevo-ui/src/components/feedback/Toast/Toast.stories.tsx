import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './Toast';
const meta = {
  title: 'Nevo UI/Feedback/Toast',
  component: Toast,
  tags: ['autodocs'],
} satisfies Meta<typeof Toast>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => (
    <ToastProvider>
      <Toast defaultOpen>
        <ToastTitle>Customer saved</ToastTitle>
        <ToastDescription>The customer record was updated.</ToastDescription>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  ),
};
