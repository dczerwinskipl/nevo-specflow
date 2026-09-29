import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Link } from './Link';

const meta = {
  title: 'Nevo UI/Actions/Link',
  component: Link,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Native anchor styling for Nevo UI. Router-specific links should consume linkVariants rather than coupling this component to a router.',
      },
    },
  },
  args: { children: 'View customer', href: '#', tone: 'default' },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Muted: Story = { args: { tone: 'muted', children: 'Back to customers' } };

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Link']}>
      <div className="grid w-fit gap-3">
        <Link data-design-canonical="true" data-design-source-id="default" href="#">
          View customer
        </Link>
        <Link data-design-canonical="true" data-design-source-id="muted" href="#" tone="muted">
          Back to customers
        </Link>
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Link',
      title: 'Link',
      description: 'Router-independent native anchor presentation for inline navigation.',
      kind: 'component',
      order: 22,
    },
  },
};



