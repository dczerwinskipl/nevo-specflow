import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Typography } from '../../foundations/Typography';
import { Collapsible } from './Collapsible';

const meta = {
  title: 'Nevo UI/Content/Collapsible',
  component: Collapsible,
  tags: ['autodocs'],
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

function Example({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  return (
    <div className="w-[32rem] max-w-full border-y border-divider">
      <Collapsible defaultExpanded={defaultExpanded}>
        <Collapsible.Trigger>Execution details</Collapsible.Trigger>
        <Collapsible.Content>
          <Typography className="text-content-secondary" variant="body-md">
            Generic disclosure content. The consumer owns the inner composition.
          </Typography>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
}

export const Collapsed: Story = {
  render: () => <Example />,
};

export const Expanded: Story = {
  render: () => <Example defaultExpanded />,
};

function CollapsibleCapture() {
  return (
    <DesignCaptureProvider captureComponents={['Collapsible']}>
      <div className="grid w-[32rem] max-w-full gap-6">
        <Collapsible
          data-design-canonical="true"
          data-design-source-id="collapsed"
          isExpanded={false}
        >
          <Collapsible.Trigger>Collapsed disclosure</Collapsible.Trigger>
          <Collapsible.Content>
            <Typography variant="body-md">Hidden details</Typography>
          </Collapsible.Content>
        </Collapsible>

        <Collapsible data-design-canonical="true" data-design-source-id="expanded" isExpanded>
          <Collapsible.Trigger>Expanded disclosure</Collapsible.Trigger>
          <Collapsible.Content>
            <Typography variant="body-md">Visible disclosure content</Typography>
          </Collapsible.Content>
        </Collapsible>
      </div>
    </DesignCaptureProvider>
  );
}

export const VariantCapture: Story = {
  render: () => <CollapsibleCapture />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Collapsible',
      title: 'Collapsible',
      description: 'Generic accessible disclosure states.',
      kind: 'component',
      order: 135,
    },
  },
};
