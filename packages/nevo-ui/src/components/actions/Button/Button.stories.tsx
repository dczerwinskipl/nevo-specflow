import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { getVariantValues, objectKeys, variantCombinations } from '@nevo/figma-core/authoring';
import { Button, buttonDefaults, buttonVariants, type ButtonProps } from './Button';
import { WorkspaceSurfacePreview } from '../../foundations/Environment';
import { iconRegistry } from '../../foundations/Icon';

const variants = getVariantValues(buttonVariants, 'variant');
const sizes = getVariantValues(buttonVariants, 'size');
const widths = getVariantValues(buttonVariants, 'width');
const icons = objectKeys(iconRegistry);
const canonicalVariants = variantCombinations(buttonVariants);
const canonicalMatrixStyle = {
  '--matrix-item-count': canonicalVariants.length,
} as CSSProperties;

const meta = {
  title: 'Nevo UI/Actions/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) =>
      context.parameters.designCapture ? (
        <Story />
      ) : (
        <WorkspaceSurfacePreview className="flex items-center justify-center">
          <Story />
        </WorkspaceSurfacePreview>
      ),
  ],
  args: { children: 'Button', disabled: false, ...buttonDefaults },
  argTypes: {
    variant: { control: 'select', options: variants },
    size: { control: 'inline-radio', options: sizes },
    width: { control: 'inline-radio', options: widths },
    leadingIcon: {
      control: 'select',
      description: 'Optional icon displayed before the label.',
      options: [undefined, ...icons],
      table: { type: { summary: 'IconName' } },
    },
    trailingIcon: {
      control: 'select',
      description: 'Optional icon displayed after the label.',
      options: [undefined, ...icons],
      table: { type: { summary: 'IconName' } },
    },
    type: {
      control: 'inline-radio',
      options: ['button', 'submit', 'reset'],
      table: { type: { summary: "'button' | 'submit' | 'reset'" } },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;
type CanonicalButtonVariant = (typeof canonicalVariants)[number];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function activationCount(button: HTMLElement): string | null {
  return button.closest('[data-activation-count]')?.getAttribute('data-activation-count') ?? null;
}

function ButtonContractExample({ disabled = false }: { disabled?: boolean }) {
  const [activations, setActivations] = useState(0);
  return (
    <div data-activation-count={activations}>
      <Button disabled={disabled} onClick={() => setActivations((value) => value + 1)}>
        {disabled ? 'Unavailable' : 'Save'}
      </Button>
    </div>
  );
}

function Capture({
  canonical,
  sourceId,
  ...props
}: ButtonProps & { canonical?: boolean; sourceId: string }) {
  return (
    <Button
      data-design-canonical={canonical ? 'true' : undefined}
      data-design-capture="true"
      data-design-source-id={sourceId}
      {...props}
    />
  );
}

function canonicalSourceId(
  combination: CanonicalButtonVariant,
  state: 'default' | 'disabled',
): string {
  const base = `${combination.variant}-${combination.size}-${combination.width}`;
  return state === 'disabled' ? `${base}-disabled` : base;
}

function ButtonMatrix() {
  return (
    <div className="variant-matrix">
      <div className="matrix-row" style={canonicalMatrixStyle}>
        <strong>generated</strong>
        {canonicalVariants.map((combination) => (
          <Capture
            canonical
            key={canonicalSourceId(combination, 'default')}
            sourceId={canonicalSourceId(combination, 'default')}
            size={combination.size}
            variant={combination.variant}
            width={combination.width}
          >
            {(combination.variant ?? 'primary').charAt(0).toUpperCase() +
              (combination.variant ?? 'primary').slice(1)}
          </Capture>
        ))}
      </div>
      <div className="matrix-row" style={canonicalMatrixStyle}>
        <strong>disabled</strong>
        {canonicalVariants.map((combination) => (
          <Capture
            canonical
            disabled
            key={canonicalSourceId(combination, 'disabled')}
            sourceId={canonicalSourceId(combination, 'disabled')}
            size={combination.size}
            variant={combination.variant}
            width={combination.width}
          >
            {(combination.variant ?? 'primary').charAt(0).toUpperCase() +
              (combination.variant ?? 'primary').slice(1)}
          </Capture>
        ))}
      </div>
      <div className="matrix-row">
        <strong>slots</strong>
        <Capture sourceId="primary-sm-leading" leadingIcon="search" size="sm">
          Search
        </Capture>
        <Capture sourceId="secondary-md-trailing" trailingIcon="arrow-right" variant="secondary">
          Continue
        </Capture>
        <Capture
          sourceId="destructive-sm-both"
          leadingIcon="trash"
          size="sm"
          trailingIcon="arrow-right"
          variant="destructive"
        >
          Remove
        </Capture>
        <Capture
          sourceId="primary-md-leading-trailing"
          leadingIcon="search"
          trailingIcon="arrow-right"
        >
          Both
        </Capture>
      </div>
    </div>
  );
}

export const Playground: Story = {};

export const KeyboardInteraction: Story = {
  render: () => <ButtonContractExample />,
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Save' });
    assert(button instanceof HTMLButtonElement, 'Button story should render a native button.');

    assert(button.getAttribute('type') === 'button', 'Button should default to type="button".');
    await userEvent.tab();
    assert(document.activeElement === button, 'Keyboard navigation should focus the Button.');
    await userEvent.keyboard('{Enter}');
    assert(activationCount(button) === '1', 'Enter should activate the focused Button once.');
  },
};

export const Disabled: Story = {
  render: () => <ButtonContractExample disabled />,
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Unavailable' });
    assert(button instanceof HTMLButtonElement, 'Button story should render a native button.');

    assert(button.disabled, 'Disabled Button should use the native disabled state.');
    button.click();
    assert(activationCount(button) === '0', 'A disabled Button should not activate.');
  },
};

export const VariantCapture: Story = {
  render: () => <ButtonMatrix />,
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Button',
      title: 'Button',
      description: 'Nevo-inspired semantic variants',
      kind: 'component',
      order: 10,
    },
  },
};

export const VariantCaptureContract: Story = {
  render: () => <ButtonMatrix />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvasElement }) => {
    const captures = Array.from(
      canvasElement.querySelectorAll<HTMLElement>(
        '[data-design-canonical="true"][data-design-source-id]',
      ),
    );
    const sourceIds = captures.map((capture) => capture.dataset.designSourceId ?? '');
    const expectedIds = canonicalVariants.flatMap((combination) => [
      canonicalSourceId(combination, 'default'),
      canonicalSourceId(combination, 'disabled'),
    ]);

    assert(
      sourceIds.length === expectedIds.length,
      'Button capture should render every canonical recipe combination in both states.',
    );
    assert(
      new Set(sourceIds).size === sourceIds.length,
      'Button canonical captures must have unique source ids.',
    );
    for (const expectedId of expectedIds) {
      assert(sourceIds.includes(expectedId), `Button capture is missing '${expectedId}'.`);
    }
  },
};
