import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { defaultNevoBrand } from './NevoBrandLogo';
import { deriveNevoMarkPalette, nevoMarkPaletteVariables } from './palette';
import { nevoMarkVariants as nevoMarkResourceVariants } from './resources';
import { NevoMark, NevoMarkAsset, type NevoMarkProps } from './NevoMark';

const sizes = ['sm', 'md', 'lg'] as const;
const variants = nevoMarkResourceVariants;
const defaultPalette = deriveNevoMarkPalette(defaultNevoBrand);

const meta = {
  title: 'SpecFlow/Brand/Nevo Mark',
  component: NevoMark,
  tags: ['autodocs'],
  args: { palette: defaultPalette, size: 'md', variant: 'brand' },
  argTypes: {
    decorative: { control: 'boolean' },
    size: { control: 'inline-radio', options: sizes },
    variant: { control: 'inline-radio', options: variants },
  },
} satisfies Meta<typeof NevoMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Brand: Story = {};

export const Monochrome: Story = {
  args: { variant: 'monochrome' },
};

export const SmallUi: Story = {
  args: { size: 'sm' },
};

export const LargeDisplay: Story = {
  args: { size: 'lg' },
};

export const LightSurface: Story = {
  args: { variant: 'monochrome' },
  decorators: [
    (Story) => (
      <div className="w-fit rounded-composite bg-white p-6 text-slate-950">
        <Story />
      </div>
    ),
  ],
};

export const DarkSurface: Story = {
  decorators: [
    (Story) => (
      <div className="w-fit rounded-composite bg-canvas p-6 text-content-primary">
        <Story />
      </div>
    ),
  ],
};

const paletteSamples = [
  ['Blue', '#2563eb'],
  ['Teal', '#0f9f8f'],
  ['Violet', '#7c3aed'],
  ['Warm', '#dc5a32'],
] as const;

export const BrandPaletteComparison: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      {paletteSamples.map(([label, primary]) => (
        <div
          className="grid min-w-40 justify-items-center gap-3 rounded-composite border border-border-default bg-surface p-5"
          key={primary}
        >
          <NevoMark
            palette={deriveNevoMarkPalette({ coreColor: primary })}
            size="lg"
            variant="brand"
          />
          <span className="font-sans text-label-sm text-content-secondary">{label}</span>
        </div>
      ))}
    </div>
  ),
};

function NevoMarkCapture({ sourceId, ...props }: NevoMarkProps & { sourceId: string }) {
  return (
    <NevoMark
      data-design-canonical="true"
      data-design-capture="true"
      data-design-source-id={sourceId}
      {...props}
    />
  );
}

function NevoMarkDesignCapture() {
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-8">
        {sizes.flatMap((size) =>
          variants.map((variant) =>
            variant === 'brand' ? (
              <NevoMarkCapture
                key={`${variant}-${size}`}
                palette={defaultPalette}
                size={size}
                sourceId={`${variant}-${size}`}
                variant="brand"
              />
            ) : (
              <NevoMarkCapture
                key={`${variant}-${size}`}
                size={size}
                sourceId={`${variant}-${size}`}
                variant="monochrome"
              />
            ),
          ),
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {nevoMarkResourceVariants.map((variant) => (
          <div
            className="size-56 text-content-primary"
            data-design-asset-capture={`mark-${variant}`}
            key={variant}
            style={
              variant === 'brand'
                ? (nevoMarkPaletteVariables(defaultPalette) as CSSProperties)
                : undefined
            }
          >
            <NevoMarkAsset variant={variant} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const DesignCapture: Story = {
  render: () => <NevoMarkDesignCapture />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'NevoMark',
      title: 'Nevo mark',
      description: 'Nevo ribbon mark × size × material',
      kind: 'component',
      order: 1,
    },
  },
};
