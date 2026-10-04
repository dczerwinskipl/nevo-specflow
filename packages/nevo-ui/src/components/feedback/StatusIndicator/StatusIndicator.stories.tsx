import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import type { StatusTone } from '../../../design-system/statusTone';
import { StatusIndicator } from './StatusIndicator';

const tones = [
  'neutral',
  'info',
  'success',
  'attention',
  'danger',
] as const satisfies readonly StatusTone[];

const meta = {
  title: 'Nevo UI/Feedback/StatusIndicator',
  component: StatusIndicator,
  tags: ['autodocs'],
  args: {
    decorative: true,
    size: 'sm',
    tone: 'neutral',
  },
  argTypes: {
    tone: { control: 'select', options: tones },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SemanticTones: Story = {
  render: () => (
    <div className="flex items-center gap-6 text-body-sm text-content-secondary">
      {tones.map((tone) => (
        <span key={tone} className="inline-flex items-center gap-2">
          <StatusIndicator tone={tone} />
          {tone}
        </span>
      ))}
    </div>
  ),
};

function StatusIndicatorCapture() {
  return (
    <DesignCaptureProvider captureComponents={['StatusIndicator']}>
      <div className="flex flex-wrap items-center gap-4">
        {(['sm', 'md'] as const).flatMap((size) =>
          tones.map((tone) => (
            <StatusIndicator
              key={`${tone}-${size}`}
              data-design-canonical="true"
              data-design-source-id={`${tone}-${size}`}
              size={size}
              tone={tone}
            />
          )),
        )}
      </div>
    </DesignCaptureProvider>
  );
}

export const VariantCapture: Story = {
  render: () => <StatusIndicatorCapture />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'StatusIndicator',
      title: 'Status indicator',
      description: 'Compact semantic status marker.',
      kind: 'component',
      order: 113,
    },
  },
};
