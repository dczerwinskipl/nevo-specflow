import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Button } from '../../actions/Button';
import { Typography } from '../../foundations/Typography';
import { Card } from './Card';

function CardExample(props: ComponentProps<typeof Card>) {
  return (
    <Card className="max-w-lg" {...props}>
      <Card.Header>
        <Typography variant="title-sm">Customer details</Typography>
        <Typography variant="body-sm" className="text-content-muted">
          Summary information for the selected customer.
        </Typography>
      </Card.Header>
      <Card.Body>
        <Typography variant="body-md">Acme Europe · Wrocław · Active</Typography>
      </Card.Body>
      <Card.Footer>
        <Button size="sm" variant="secondary">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </Card.Footer>
    </Card>
  );
}

const meta = {
  title: 'Nevo UI/Surfaces/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Gap-based card anatomy. Sections share one surface and never add implicit divider lines or nested padding bands.',
      },
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <CardExample />,
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Card']}>
      <CardExample data-design-canonical="true" data-design-source-id="default" />
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Card',
      title: 'Card',
      description: 'One-surface card with shared padding and gap-based header/body/footer anatomy.',
      kind: 'component',
      order: 72,
    },
  },
};
