import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Typography } from '../../foundations/Typography';
import { Progress } from './Progress';

const meta = {
  title: 'Nevo UI/Feedback/Progress',
  component: Progress,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Operation progress',
    value: 67,
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="w-64">
      <Progress {...args} />
    </div>
  ),
};

export const WithMetadata: Story = {
  render: () => (
    <div className="grid w-[28rem] max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
      <Typography className="text-content-secondary" variant="body-sm">
        Running
      </Typography>
      <Progress aria-label="Running progress" value={67} />
      <Typography className="text-content-muted" variant="code-md">
        67%
      </Typography>
    </div>
  ),
};

export const Values: Story = {
  render: () => (
    <div className="grid w-[28rem] max-w-full gap-4">
      {[0, 18, 50, 100].map((value) => (
        <div key={value} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Progress aria-label={`${value}% progress`} value={value} />
          <Typography className="text-right text-content-muted" variant="code-md">
            {value}%
          </Typography>
        </div>
      ))}
    </div>
  ),
};

function ProgressCapture() {
  return (
    <DesignCaptureProvider captureComponents={['Progress']}>
      <div className="w-64">
        <Progress
          aria-label="Canonical progress"
          data-design-canonical="true"
          data-design-source-id="default"
          value={67}
        />
      </div>
    </DesignCaptureProvider>
  );
}

export const CanonicalCapture: Story = {
  render: () => <ProgressCapture />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Progress',
      title: 'Progress',
      description: 'Determinate progress geometry and semantic color roles.',
      kind: 'component',
      order: 114,
    },
  },
};



