import type { Meta, StoryObj } from '@storybook/react-vite';
import { NevoBrandLogo } from './NevoBrandLogo';

const meta = {
  title: 'SpecFlow/Brand/Nevo Logo',
  component: NevoBrandLogo,
  args: {
    appearance: 'brand',
    brand: 'nevo',
    coreColor: '#2b6bff',
    product: 'ui',
    secondaryColor: '#21d7e8',
    size: 'lg',
    slogan: 'Interfaces built together',
    type: 'signature',
  },
  argTypes: {
    appearance: { control: 'inline-radio', options: ['brand', 'monochrome'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    type: { control: 'inline-radio', options: ['mark', 'horizontal', 'stacked', 'signature'] },
  },
} satisfies Meta<typeof NevoBrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Types: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <NevoBrandLogo size="lg" type="mark" />
      <NevoBrandLogo brand="nevo" product="crm" size="lg" type="horizontal" />
      <NevoBrandLogo
        brand="nevo"
        product="ui"
        size="lg"
        slogan={['Interfaces built', 'together']}
        type="signature"
      />
      <NevoBrandLogo brand="nevo" product="ui" size="lg" type="stacked" />
    </div>
  ),
};

export const Compact: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />
      <NevoBrandLogo
        appearance="monochrome"
        brand="nevo"
        product="SpecFlow"
        size="sm"
        type="horizontal"
      />
    </div>
  ),
};

const productFamily = [
  { product: undefined, coreColor: '#2b6bff', secondaryColor: '#21d7e8' },
  { product: 'cloud', coreColor: '#7c3aed', secondaryColor: '#93c5fd' },
  { product: 'ui', coreColor: '#1687ff', secondaryColor: '#16e0cf' },
  { product: 'deploy', coreColor: '#7c3aed', secondaryColor: '#d8b4fe' },
] as const;

export const ProductFamily: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-8">
      {productFamily.map((identity) => (
        <div className="grid min-w-36 justify-items-center gap-4" key={identity.product ?? 'core'}>
          <NevoBrandLogo
            brand="nevo"
            coreColor={identity.coreColor}
            product={identity.product}
            secondaryColor={identity.secondaryColor}
            size="lg"
            type="stacked"
          />
        </div>
      ))}
    </div>
  ),
};

export const Monochrome: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12 text-content-primary">
      <NevoBrandLogo appearance="monochrome" size="lg" type="mark" />
      <NevoBrandLogo
        appearance="monochrome"
        brand="nevo"
        product="ui"
        size="lg"
        slogan="Interfaces built together"
        type="signature"
      />
      <NevoBrandLogo appearance="monochrome" brand="nevo" product="ui" size="lg" type="stacked" />
    </div>
  ),
};

export const DesignCapture: Story = {
  tags: ['!dev', '!autodocs'],
  render: () => (
    <div className="grid gap-8">
      {(['brand', 'monochrome'] as const).flatMap((appearance) =>
        (['sm', 'md', 'lg'] as const).flatMap((size) =>
          (['mark', 'horizontal', 'stacked', 'signature'] as const).map((type) => {
            const common = {
              appearance,
              'data-design-canonical': 'true',
              'data-design-capture': 'true',
              'data-design-source-id': `${appearance}-${size}-${type}`,
              size,
            } as const;
            if (type === 'mark') {
              return (
                <NevoBrandLogo key={`${appearance}-${size}-${type}`} {...common} type="mark" />
              );
            }
            if (type === 'signature') {
              return (
                <NevoBrandLogo
                  key={`${appearance}-${size}-${type}`}
                  {...common}
                  brand="nevo"
                  product="ui"
                  slogan="Interfaces built together"
                  type="signature"
                />
              );
            }
            return (
              <NevoBrandLogo
                key={`${appearance}-${size}-${type}`}
                {...common}
                brand="nevo"
                product="ui"
                type={type}
              />
            );
          }),
        ),
      )}
    </div>
  ),
  parameters: {
    designCapture: {
      kind: 'component',
      component: 'NevoBrandLogo',
      title: 'Nevo brand logo',
      description: 'Product identity lockups built from the shared Nevo mark.',
    },
  },
};
