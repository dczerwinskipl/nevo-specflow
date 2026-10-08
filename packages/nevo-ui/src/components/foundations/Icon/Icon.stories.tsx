import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlarmClock, CloudCog } from 'lucide-react';
import { objectKeys } from '@nevo/figma-core/authoring';
import { iconNames } from '../../../design-system/resources';
import { Icon, iconRegistry, iconSizeClasses, type IconName, type IconSize } from './Icon';
import { Button } from '../../actions/Button';
import { IconButton } from '../../actions/IconButton';

const names = objectKeys(iconRegistry);
const designNames = iconNames;
const sizes = objectKeys(iconSizeClasses);

const meta = {
  title: 'Nevo UI/Foundations/Icon',
  component: Icon,
  tags: ['autodocs'],
  args: { name: 'search', size: 'md' },
  argTypes: {
    decorative: { control: 'boolean' },
    name: {
      control: 'select',
      description: 'Semantic glyph name from the shared icon registry.',
      options: names,
      table: { type: { summary: 'IconName' } },
    },
    size: { control: 'inline-radio', options: sizes },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

function IconCapture({ name, size }: { name: IconName; size: IconSize }) {
  return (
    <div
      className="flex min-h-13 items-center gap-2.5 rounded-[10px] border border-border-default bg-surface p-3 text-content-secondary"
      data-design-asset-capture={`${name}-${size}`}
      data-design-capture="true"
    >
      <Icon name={name} size={size} />
      <code className="font-mono text-[11px] leading-[1.4] text-content-muted">
        {name} / {size}
      </code>
    </div>
  );
}

function IconMatrix() {
  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(145px,1fr))]">
      {designNames.flatMap((name) =>
        sizes.map((size) => <IconCapture key={`${name}-${size}`} name={name} size={size} />),
      )}
    </div>
  );
}

export const Playground: Story = {};

export const Semantic: Story = {
  args: {
    'aria-label': 'Repository branch',
    decorative: false,
    name: 'branch',
  },
};

export const DesignCapture: Story = {
  render: () => <IconMatrix />,
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Icon',
      title: 'Icon',
      description: 'Shared semantic glyph registry × 2 sizes',
      kind: 'primitive',
      order: 0,
    },
  },
};

/** Consumers can import any Lucide icon without extending the Figma asset catalogue. */
export const LucideDirectImports: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-4">
      <Icon aria-label="Scheduled" decorative={false} name={AlarmClock} />
      <Button leadingIcon={AlarmClock}>Schedule</Button>
      <IconButton aria-label="Cloud configuration" icon={CloudCog} />
    </div>
  ),
};
