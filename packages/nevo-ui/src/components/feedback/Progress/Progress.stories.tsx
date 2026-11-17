import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Typography } from '../../foundations/Typography';
import { Progress, type ProgressPosition } from './Progress';

const meta = {
  title: 'Nevo UI/Feedback/Progress',
  component: Progress,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Operation progress',
    value: 67,
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="w-64">
      <Progress {...args} />
    </div>
  ),
};

export const WithMetadata: Story = {
  render: () => (
    <div className="grid w-[28rem] max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
      <Typography className="text-content-secondary" variant="body-sm">
        Running
      </Typography>
      <Progress aria-label="Running progress" value={67} />
      <Typography className="text-content-muted" variant="code-md">
        67%
      </Typography>
    </div>
  ),
};

export const Values: Story = {
  render: () => (
    <div className="grid w-[28rem] max-w-full gap-4">
      {[0, 18, 50, 100].map((value) => (
        <div key={value} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Progress aria-label={`${value}% progress`} value={value} />
          <Typography className="text-right text-content-muted" variant="code-md">
            {value}%
          </Typography>
        </div>
      ))}
    </div>
  ),
};

export const Segmented: Story = {
  render: () => (
    <div className="w-28">
      <Progress
        aria-label="Task completion"
        aria-valuetext="5 of 9 tasks"
        variant="segmented"
        size="compact"
        completed={5}
        total={9}
      />
    </div>
  ),
};

const positionCases: readonly {
  readonly label: string;
  readonly ariaLabel: string;
  readonly position: ProgressPosition;
  readonly total: number;
  readonly size?: 'default' | 'compact';
}[] = [
  {
    label: 'First step · Gather requirements',
    ariaLabel: 'Not started: first step Gather requirements',
    position: { state: 'not-started' },
    total: 7,
  },
  {
    label: 'Step 1 of 7 · next: Write the solution',
    ariaLabel: 'Step 1 of 7: Gather requirements',
    position: { state: 'current', step: 1 },
    total: 7,
  },
  {
    label: 'Step 4 of 7 · next: Review the breakdown',
    ariaLabel: 'Step 4 of 7: Break the solution down',
    position: { state: 'current', step: 4 },
    total: 7,
  },
  {
    label: 'Step 5 of 7 (wait step, compact) · next: Verify',
    ariaLabel: 'Step 5 of 7: Implement the tasks',
    position: { state: 'current', step: 5 },
    total: 7,
    size: 'compact',
  },
  {
    label: 'All 7 steps · completed',
    ariaLabel: 'All 7 steps completed',
    position: { state: 'completed' },
    total: 7,
  },
  {
    label: 'Ended at step 3 of 7',
    ariaLabel: 'Ended at step 3 of 7',
    position: { state: 'abandoned', step: 3 },
    total: 7,
  },
  {
    label: 'Step 9 of 16 · the segments shrink to 16rem',
    ariaLabel: 'Step 9 of 16: Review',
    position: { state: 'current', step: 9 },
    total: 16,
  },
];

function PositionRows() {
  return (
    <div className="grid w-[32rem] max-w-full gap-4">
      {positionCases.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <Progress
            aria-label={item.ariaLabel}
            variant="segmented"
            total={item.total}
            position={item.position}
            {...(item.size ? { size: item.size } : {})}
          />
          <Typography aria-hidden="true" className="text-content-secondary" variant="body-sm">
            {item.label}
          </Typography>
        </div>
      ))}
    </div>
  );
}

/**
 * Position mode: where a step sits among the workflow's steps (not how much is done). The label
 * beside the track is `aria-hidden`; the track's own `aria-label` names the position.
 */
export const Position: Story = {
  render: () => <PositionRows />,
};

function PositionGeometryFixture() {
  return (
    <div className="grid gap-4">
      <div className="w-[32rem]" data-case="seven">
        <Progress
          aria-label="Step 4 of 7: Break the solution down"
          variant="segmented"
          total={7}
          position={{ state: 'current', step: 4 }}
        />
      </div>
      <div className="w-[32rem]" data-case="many">
        <Progress
          aria-label="Step 20 of 40: Review"
          variant="segmented"
          total={40}
          position={{ state: 'current', step: 20 }}
        />
      </div>
      <div className="w-[7.5rem]" data-case="narrow">
        <Progress
          aria-label="Step 2 of 7: Write the solution"
          variant="segmented"
          size="compact"
          total={7}
          position={{ state: 'current', step: 2 }}
        />
      </div>
      <div className="w-[32rem]" data-case="not-started">
        <Progress
          aria-label="Not started: first step Gather requirements"
          variant="segmented"
          total={7}
          position={{ state: 'not-started' }}
        />
      </div>
      <span data-probe="info" className="bg-status-info" />
    </div>
  );
}

function positionGeometryOf(canvasElement: HTMLElement, name: string) {
  const track = canvasElement.querySelector<HTMLElement>(`[data-case="${name}"] [role="img"]`);
  if (!track) {
    throw new Error(`Missing position track ${name}.`);
  }

  const segments = [...track.querySelectorAll<HTMLElement>('[data-progress-segment]')];

  return {
    track,
    segments,
    widths: segments.map((segment) => segment.getBoundingClientRect().width),
  };
}

export const PositionGeometryContract: Story = {
  tags: ['contract', '!autodocs'],
  render: () => <PositionGeometryFixture />,
  play: async ({ canvasElement, canvas }) => {
    const info = window.getComputedStyle(
      canvasElement.querySelector<HTMLElement>('[data-probe="info"]')!,
    ).backgroundColor;
    const seven = positionGeometryOf(canvasElement, 'seven');
    if (canvas.getByRole('img', { name: 'Step 4 of 7: Break the solution down' }) !== seven.track) {
      throw new Error('The track is an image named by its position.');
    }

    if (seven.track.hasAttribute('aria-valuenow')) {
      throw new Error('A position is not progress: no progressbar values.');
    }

    const expected = [20, 20, 20, 40, 20, 20, 20];
    if (seven.widths.some((width, index) => Math.abs(width - expected[index]!) > 0.5)) {
      throw new Error(`Segments are 20 px, the current one 40 px; got ${seven.widths.join(', ')}.`);
    }

    if (Math.round(seven.track.getBoundingClientRect().height) !== 6) {
      throw new Error('The default track is 6 px high.');
    }

    if (window.getComputedStyle(seven.segments[3]!).backgroundColor !== info) {
      throw new Error('The current segment uses status-info.');
    }

    const animated = seven.segments.some((segment) =>
      window
        .getComputedStyle(segment)
        .transitionDuration.split(',')
        .some((duration) => parseFloat(duration) > 0),
    );
    if (animated) {
      throw new Error('The position track does not animate.');
    }

    const many = positionGeometryOf(canvasElement, 'many');
    if (many.track.getBoundingClientRect().width > 256.5) {
      throw new Error('The track is at most 16rem wide.');
    }

    if (many.widths.some((width) => width < 3.99)) {
      throw new Error('Segments never shrink below 4 px.');
    }

    const narrow = positionGeometryOf(canvasElement, 'narrow');
    if (narrow.track.getBoundingClientRect().width > 120.5) {
      throw new Error('The track fits a narrower container.');
    }

    if (Math.round(narrow.track.getBoundingClientRect().height) !== 4) {
      throw new Error('The compact track is 4 px high.');
    }

    if (narrow.widths[1]! <= narrow.widths[0]!) {
      throw new Error('The current segment stays the widest while shrinking.');
    }

    const notStarted = positionGeometryOf(canvasElement, 'not-started');
    if (!window.getComputedStyle(notStarted.segments[0]!).boxShadow.includes('inset')) {
      throw new Error('Before the start the first step is outlined.');
    }
  },
};

const geometryCases = [
  { width: 112, total: 9, completed: 5, segments: true },
  { width: 104, total: 17, completed: 0, segments: true },
  { width: 104, total: 18, completed: 18, segments: false },
  { width: 112, total: 19, completed: 6, segments: true },
  { width: 112, total: 20, completed: 6, segments: false },
  { width: 688, total: 100, completed: 50, segments: true },
  { width: 51.99, total: 9, completed: 5, segments: false },
  { width: 52, total: 9, completed: 5, segments: true },
  { width: 112, total: 10000, completed: 9999, segments: false },
];

async function waitForGeometry(assert: () => void) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      assert();

      return;
    } catch (error) {
      if (attempt === 59) {
        throw error;
      }
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function GeometryFixture() {
  const [index, setIndex] = useState(0);
  const scenario = geometryCases[index]!;

  return (
    <div className="grid gap-4">
      <div style={{ width: scenario.width }}>
        <Progress
          aria-label="Geometry progress"
          variant="segmented"
          size="compact"
          completed={scenario.completed}
          total={scenario.total}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {geometryCases.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
          >{`Case ${i}: ${item.width}px / ${item.total}`}</button>
        ))}
      </div>
    </div>
  );
}

export const GeometryContract: Story = {
  tags: ['contract', '!autodocs'],
  render: () => <GeometryFixture />,
  play: async ({ canvas, userEvent }) => {
    for (const index of [...geometryCases.keys(), 0]) {
      const scenario = geometryCases[index]!;
      await userEvent.click(
        canvas.getByRole('button', {
          name: `Case ${index}: ${scenario.width}px / ${scenario.total}`,
        }),
      );
      const bar = canvas.getByRole('progressbar');
      await waitForGeometry(() => {
        if (
          bar.getAttribute('data-progress-representation') !==
          (scenario.segments ? 'segmented' : 'continuous')
        ) {
          throw new Error('Representation must follow actual width.');
        }

        if (
          bar.querySelectorAll('[data-progress-segment]').length !==
          (scenario.segments ? scenario.total : 0)
        ) {
          throw new Error('Segments must represent exactly the aggregate total.');
        }
      });
      if (
        bar.getAttribute('aria-valuemax') !== String(scenario.total) ||
        bar.getAttribute('aria-valuenow') !== String(scenario.completed)
      ) {
        throw new Error('Resize must preserve aggregate accessibility.');
      }

      if (
        Math.abs(bar.getBoundingClientRect().width - scenario.width) > 0.02 ||
        bar.getBoundingClientRect().height !== 4
      ) {
        throw new Error('Fallback must preserve track geometry.');
      }

      const completed = bar.querySelectorAll('[data-completed="true"]');
      if (scenario.segments && completed.length !== scenario.completed) {
        throw new Error('Completed segment count is exact.');
      }

      const segment = bar.querySelector<HTMLElement>('[data-progress-segment]');
      if (
        segment &&
        (window.getComputedStyle(segment).borderRadius !== '2px' ||
          segment.getBoundingClientRect().width < 4)
      ) {
        throw new Error('Segments need rounded, legible ends.');
      }
    }
  },
};

function ProgressCapture() {
  return (
    <DesignCaptureProvider captureComponents={['Progress']}>
      <div className="grid gap-4">
        {(['default', 'compact'] as const).flatMap((size) =>
          (['continuous', 'segmented', 'segmented-position'] as const).map((variant) => (
            <div key={`${size}-${variant}`} className={size === 'compact' ? 'w-28' : 'w-64'}>
              <Progress
                aria-label="Canonical progress"
                data-design-canonical="true"
                data-design-source-id={
                  size === 'default' && variant === 'continuous' ? 'default' : `${size}-${variant}`
                }
                size={size}
                {...(variant === 'segmented-position'
                  ? {
                      variant: 'segmented',
                      total: 7,
                      position: { state: 'current', step: 4 },
                    }
                  : variant === 'segmented'
                    ? { variant, completed: 5, total: 9 }
                    : { variant, value: 67 })}
              />
            </div>
          )),
        )}
      </div>
    </DesignCaptureProvider>
  );
}

export const CanonicalCapture: Story = {
  render: () => <ProgressCapture />,
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Progress',
      title: 'Progress',
      description: 'Determinate progress geometry and semantic color roles.',
      kind: 'component',
      order: 114,
    },
  },
};
