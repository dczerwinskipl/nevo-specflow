import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { getVariantValues, variantCombinations } from '@nevo/figma-core/authoring';
import {
  IconButton,
  iconButtonDefaults,
  iconButtonVariants,
  type IconButtonProps,
} from './IconButton';
import { iconRegistry } from '../../foundations/Icon';

const variants = getVariantValues(iconButtonVariants, 'variant');
const sizes = getVariantValues(iconButtonVariants, 'size');
const canonicalVariants = variantCombinations(iconButtonVariants);

const meta = {
  title: 'Nevo UI/Actions/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  args: { 'aria-label': 'Add item', icon: 'plus', disabled: false, ...iconButtonDefaults },
  argTypes: {
    variant: { control: 'select', options: variants },
    size: { control: 'inline-radio', options: sizes },
    icon: {
      control: 'select',
      description: 'Semantic icon rendered inside the button.',
      options: Object.keys(iconRegistry),
      table: { type: { summary: 'IconName' } },
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function IconButtonContractExample() {
  const [activations, setActivations] = useState(0);
  return (
    <div data-activation-count={activations}>
      <IconButton
        aria-label="Add item"
        icon="plus"
        onClick={() => setActivations((value) => value + 1)}
      />
    </div>
  );
}

function Capture({
  canonical,
  sourceId,
  ...props
}: IconButtonProps & { canonical?: boolean; sourceId: string }) {
  return (
    <IconButton
      data-design-canonical={canonical ? 'true' : undefined}
      data-design-capture="true"
      data-design-source-id={sourceId}
      {...props}
    />
  );
}

function IconButtonMatrix() {
  return (
    <div className="variant-matrix">
      <div className="matrix-row matrix-row-compact">
        <strong>generated</strong>
        {canonicalVariants.map(({ size, variant }) => (
          <Capture
            aria-label={`${variant} action`}
            canonical
            icon="plus"
            key={`${variant}-${size}`}
            size={size}
            sourceId={`${variant}-${size}`}
            variant={variant}
          />
        ))}
      </div>
      <div className="matrix-row matrix-row-compact">
        <strong>disabled</strong>
        {canonicalVariants.map(({ size, variant }) => (
          <Capture
            aria-label={`${variant} action unavailable`}
            canonical
            disabled
            icon="plus"
            key={`${variant}-${size}-disabled`}
            size={size}
            sourceId={`${variant}-${size}-disabled`}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}

export const Playground: Story = {};

export const ExtraSmall: Story = {
  args: { size: 'xs' },
};

export const KeyboardInteraction: Story = {
  render: () => <IconButtonContractExample />,
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Add item' });
    assert(button instanceof HTMLButtonElement, 'IconButton should render a native button.');
    assert(button.type === 'button', 'IconButton should default to type="button".');
    await userEvent.tab();
    assert(document.activeElement === button, 'Keyboard navigation should focus IconButton.');
    await userEvent.keyboard('{Enter}');
    assert(
      button.closest('[data-activation-count]')?.getAttribute('data-activation-count') === '1',
      'Enter should activate IconButton once.',
    );
  },
};

export const VariantCapture: Story = {
  render: () => <IconButtonMatrix />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'IconButton',
      title: 'Icon button',
      description: 'Compact accessible actions for business applications and dashboards',
      kind: 'component',
      order: 12,
    },
  },
};



