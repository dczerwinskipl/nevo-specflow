import type { Meta, StoryObj } from '@storybook/react-vite';
import { Typography, type TypographyVariant } from './Typography';

const typographySample = 'The quick brown fox jumps over the lazy dog.';
const typography = [
  { variant: 'title-lg', name: 'Title/Large' },
  { variant: 'title-md', name: 'Title/Medium' },
  { variant: 'title-sm', name: 'Title/Small' },
  { variant: 'body-lg', name: 'Body/Large' },
  { variant: 'body-md', name: 'Body/Medium' },
  { variant: 'body-sm', name: 'Body/Small' },
  { variant: 'label-md', name: 'Label/Medium' },
  { variant: 'label-sm', name: 'Label/Small' },
  { variant: 'section-label', name: 'Section/Label' },
  { variant: 'code-md', name: 'Code/Medium' },
] as const satisfies readonly { variant: TypographyVariant; name: string }[];

const meta = {
  title: 'Nevo UI/Foundations/Typography',
  component: Typography,
  tags: ['autodocs'],
  args: { children: typographySample, variant: 'body-md' },
  argTypes: {
    variant: { control: 'select', options: typography.map((item) => item.variant) },
  },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

function TypographyMatrix() {
  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {typography.map(({ name, variant }) => (
        <div
          className="grid min-h-26 gap-2.5 rounded-[10px] border border-border-default bg-surface p-4"
          key={variant}
        >
          <code className="font-mono text-[11px] leading-[1.4] text-content-muted">
            {name} · {variant}
          </code>
          <Typography
            className="text-content-primary"
            data-design-capture="true"
            data-design-resource-name={name}
            data-design-text-style-capture={variant}
            variant={variant}
          >
            {typographySample}
          </Typography>
        </div>
      ))}
    </div>
  );
}

export const Playground: Story = {};

export const DesignCapture: Story = {
  render: () => <TypographyMatrix />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Typography',
      title: 'Typography',
      description: 'Compact NEXT roles for headings, body, controls, and technical content',
      kind: 'primitive',
      order: 5,
    },
  },
};
