import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../../actions/Button';
import { Typography } from '../../foundations/Typography';
import { ScrollArea } from './ScrollArea';

const lightSurfaceStyle = {
  '--color-content-primary': '#18181b',
  '--color-content-secondary': '#3f3f46',
  '--color-content-muted': '#71717a',
  '--color-border-subtle': 'rgba(0, 0, 0, 0.1)',
  '--color-surface': '#ffffff',
  '--color-surface-subtle': '#f4f4f5',
  '--color-scroll-edge-indicator':
    'color-mix(in srgb, var(--color-content-primary) 15%, transparent)',
  color: 'var(--color-content-primary)',
} as CSSProperties;

function StoryFrame({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div
      className="min-h-96 bg-canvas p-8"
      style={light ? { ...lightSurfaceStyle, background: '#ececef' } : undefined}
    >
      <div
        className="mx-auto max-w-3xl rounded-surface border border-border-subtle bg-surface p-5"
        style={light ? lightSurfaceStyle : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function WideContent() {
  return (
    <div className="flex w-max gap-3 p-3">
      {Array.from({ length: 12 }, (_, index) => (
        <div
          className="grid h-28 w-40 shrink-0 place-items-center rounded-composite border border-border-subtle bg-surface-subtle"
          key={index}
        >
          <Typography variant="label-md">Column {index + 1}</Typography>
        </div>
      ))}
    </div>
  );
}

function LongContent({ count = 24 }: { count?: number }) {
  return (
    <div className="grid gap-2 p-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          className="rounded-control border border-border-subtle bg-surface-subtle px-3 py-2"
          key={index}
        >
          <Typography variant="body-md">Scrollable item {index + 1}</Typography>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Layout/ScrollArea',
  component: ScrollArea,
  args: { children: null },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reusable overflow viewport with surface-aware, pointer-transparent continuation indicators. Scroll each story from edge to edge to evaluate the state changes.',
      },
    },
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HorizontalLightSurface: Story = {
  render: () => (
    <StoryFrame light>
      <ScrollArea
        aria-label="Horizontal light-surface example"
        className="rounded-composite border border-border-subtle bg-surface"
        direction="horizontal"
        viewportClassName="max-w-full"
      >
        <WideContent />
      </ScrollArea>
    </StoryFrame>
  ),
};

export const HorizontalDarkSurface: Story = {
  render: () => (
    <StoryFrame>
      <ScrollArea
        aria-label="Horizontal dark-surface example"
        className="rounded-composite border border-border-subtle bg-surface"
        direction="horizontal"
        viewportClassName="max-w-full"
      >
        <WideContent />
      </ScrollArea>
    </StoryFrame>
  ),
};

export const VerticalLightSurface: Story = {
  render: () => (
    <StoryFrame light>
      <ScrollArea
        aria-label="Vertical light-surface example"
        className="h-72 rounded-composite border border-border-subtle bg-surface"
        direction="vertical"
      >
        <LongContent />
      </ScrollArea>
    </StoryFrame>
  ),
};

export const VerticalDarkSurface: Story = {
  render: () => (
    <StoryFrame>
      <ScrollArea
        aria-label="Vertical dark-surface example"
        className="h-72 rounded-composite border border-border-subtle bg-surface"
        direction="vertical"
      >
        <LongContent />
      </ScrollArea>
    </StoryFrame>
  ),
};

export const NoOverflow: Story = {
  render: () => (
    <StoryFrame>
      <ScrollArea
        aria-label="Content without overflow"
        className="rounded-composite border border-border-subtle bg-surface p-4"
        direction="both"
      >
        <Typography variant="body-md">This content fits. No continuation edge is shown.</Typography>
      </ScrollArea>
    </StoryFrame>
  ),
};

function DynamicOverflowFixture() {
  const [wide, setWide] = useState(false);
  return (
    <StoryFrame>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Typography variant="body-md">
          Toggle content width, then resize the Storybook viewport.
        </Typography>
        <Button onClick={() => setWide((current) => !current)} size="sm">
          {wide ? 'Make content fit' : 'Make content overflow'}
        </Button>
      </div>
      <ScrollArea
        aria-label="Dynamic overflow example"
        className="rounded-composite border border-border-subtle bg-surface"
        direction="horizontal"
      >
        <div
          className="grid h-32 place-items-center bg-surface-subtle transition-[width] duration-150"
          style={{ width: wide ? 1200 : '100%' }}
        >
          <Typography variant="label-md">{wide ? '1200px content' : 'Fitted content'}</Typography>
        </div>
      </ScrollArea>
    </StoryFrame>
  );
}

export const DynamicContentAndResize: Story = {
  render: () => <DynamicOverflowFixture />,
};
