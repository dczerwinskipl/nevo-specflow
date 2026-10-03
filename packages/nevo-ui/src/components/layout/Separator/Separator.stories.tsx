import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Separator } from './Separator';

const meta = {
  title: 'Nevo UI/Layout/Separator',
  component: Separator,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Semantic divider. It owns line appearance only; parent composition owns margins and spacing.',
      },
    },
  },
  args: { orientation: 'horizontal' },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-80 py-4">
      <Separator {...args} />
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <div className="flex h-10 items-center gap-3">
      <span>Before</span>
      <Separator {...args} />
      <span>After</span>
    </div>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Separator']}>
      <div className="grid gap-5 p-2">
        <Separator data-design-canonical="true" data-design-source-id="horizontal" />
        <div className="h-12 w-20">
          <Separator
            data-design-canonical="true"
            data-design-source-id="vertical"
            orientation="vertical"
          />
        </div>
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Separator',
      title: 'Separator',
      description: 'Semantic horizontal and vertical dividers using the shared divider token.',
      kind: 'component',
      order: 36,
    },
  },
};
