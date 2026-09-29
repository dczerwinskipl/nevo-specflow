import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Typography } from '../../foundations/Typography';
import { Surface } from './Surface';

const tones = ['default', 'raised', 'subtle'] as const;

const toneUsage = {
  default: 'Normal application content surface.',
  raised: 'Content visually above the base layer, for example cards and floating containers.',
  subtle: 'Quiet grouping or secondary content that should recede from the default surface.',
} as const;

const meta = {
  title: 'Nevo UI/Surfaces/Surface',
  component: Surface,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Low-level semantic content surface. Tones intentionally remain close: they describe layer meaning, not decorative card variants. Form controls keep their own control-surface contract.',
      },
    },
  },
  args: { tone: 'default' },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="max-w-lg bg-canvas p-4">
      <Surface {...args} className="rounded-composite border border-border-subtle p-4">
        Surface content
      </Surface>
    </div>
  ),
};

export const SemanticLayers: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3 bg-canvas p-4">
      {tones.map((tone) => (
        <Surface
          key={tone}
          tone={tone}
          className="rounded-composite border border-border-subtle p-4"
        >
          <Typography variant="label-md">{tone}</Typography>
          <Typography className="mt-1 text-content-muted" variant="body-sm">
            {toneUsage[tone]}
          </Typography>
        </Surface>
      ))}
    </div>
  ),
};

export const NestedUsage: Story = {
  render: () => (
    <Surface tone="default" className="max-w-lg rounded-composite border border-border-subtle p-4">
      <Typography variant="label-md">Workspace content</Typography>
      <Surface tone="subtle" className="mt-3 rounded-control border border-border-subtle p-3">
        <Typography className="text-content-muted" variant="body-sm">
          Secondary grouping inside the normal content surface.
        </Typography>
      </Surface>
      <Surface tone="raised" className="mt-3 rounded-composite border border-border-default p-3">
        <Typography className="text-content-muted" variant="body-sm">
          Raised content layer. Card uses this tone as its base surface.
        </Typography>
      </Surface>
    </Surface>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Surface']}>
      <div className="grid max-w-2xl gap-3 bg-canvas p-4">
        {tones.map((tone) => (
          <Surface
            key={tone}
            data-design-canonical="true"
            data-design-source-id={tone}
            tone={tone}
            className="min-h-20 rounded-composite border border-border-subtle p-4"
          >
            {tone}
          </Surface>
        ))}
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Surface',
      title: 'Surface',
      description:
        'Semantic content layers: default, raised and subtle. Control surfaces remain owned by form controls.',
      kind: 'component',
      order: 70,
    },
  },
};
