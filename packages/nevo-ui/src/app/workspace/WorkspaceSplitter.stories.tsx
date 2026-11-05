import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { WorkspaceSplitter } from './WorkspaceSplitter';

// `WorkspaceSplitter` is not a public standalone layout primitive — `AppWorkspace` is the only
// renderer (workspace-dynamic-split.md §4.3) — so this file, like `AppWorkspaceDynamicSplit
// .contract.stories.tsx`, lives under Internal rather than the public component catalog. Its job is
// the splitter's own contract in isolation: ARIA/keyboard/pointer/touch behavior (§7) without any
// `AppWorkspace`/resolver wiring around it. End-to-end pointer-drag ("commits mode: 'manual'") and
// touch-drag ("does not scroll the page/pane ancestors") coverage lives in
// `AppWorkspaceDynamicSplit.contract.stories.tsx`, where that wiring actually exists.

function SplitterFixture({
  initialRatio = 0.5,
  minSecondaryRatio = 0.2,
  maxSecondaryRatio = 0.8,
  secondarySide = 'end',
}: {
  initialRatio?: number;
  minSecondaryRatio?: number;
  maxSecondaryRatio?: number;
  secondarySide?: 'start' | 'end';
}) {
  const [ratio, setRatio] = useState(initialRatio);
  const availableWidth = 600;
  const secondaryWidth = Math.round(availableWidth * ratio);

  const primaryPane = (
    <div
      className="min-w-0 flex-1 bg-app-base p-4 text-content-secondary"
      style={{ width: availableWidth - secondaryWidth }}
    >
      Primary
    </div>
  );
  const secondaryPane = (
    <div
      className="min-w-0 bg-app-base p-4 text-content-secondary"
      style={{ width: secondaryWidth }}
    >
      Secondary
    </div>
  );
  const splitter = (
    <WorkspaceSplitter
      availableWidth={availableWidth}
      label="Resize secondary panel"
      maxSecondaryRatio={maxSecondaryRatio}
      minSecondaryRatio={minSecondaryRatio}
      onSecondaryRatioChange={setRatio}
      secondaryRatio={ratio}
      secondarySide={secondarySide}
    />
  );

  return (
    <div className="flex h-64 w-[600px] items-stretch bg-canvas" data-testid="splitter-fixture">
      {secondarySide === 'start' ? (
        <>
          {secondaryPane}
          {splitter}
          {primaryPane}
        </>
      ) : (
        <>
          {primaryPane}
          {splitter}
          {secondaryPane}
        </>
      )}
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Internal/Workspace/Splitter',
  tags: ['contract', '!autodocs'],
  parameters: { layout: 'centered' },
  render: () => <SplitterFixture />,
} satisfies Meta;
export default meta;
type Story = StoryObj;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// No `a11y: { test: 'off' }` here on purpose: the fixture renders nothing but the splitter and its
// two plain panes, so the default a11y addon's axe run (preview.ts: `test: 'error'`) checks the
// splitter itself, not an unrelated page — satisfying the task's "axe/a11y check specifically on the
// splitter" requirement rather than a generic pass elsewhere.
export const DefaultContract: Story = {
  play: async ({ canvas }) => {
    const splitter = canvas.getByRole('separator', { name: 'Resize secondary panel' });
    assert(splitter.getAttribute('aria-orientation') === 'vertical', 'Vertical window-splitter.');
    assert(splitter.getAttribute('aria-valuenow') === '50', 'Reflects the live 50/50 split.');
    assert(splitter.getAttribute('tabindex') === '0', 'Focusable.');
  },
};

export const KeyboardAdjustsRatioContract: Story = {
  render: () => <SplitterFixture maxSecondaryRatio={0.75} minSecondaryRatio={0.25} />,
  play: async ({ canvas, userEvent }) => {
    const splitter = canvas.getByRole('separator', { name: 'Resize secondary panel' });
    splitter.focus();

    await userEvent.keyboard('{ArrowRight}');
    assert(
      Number(splitter.getAttribute('aria-valuenow')) < 50,
      'ArrowRight shrinks Secondary’s share.',
    );

    await userEvent.keyboard('{Home}');
    assert(splitter.getAttribute('aria-valuenow') === '25', 'Home jumps to the minimum.');

    await userEvent.keyboard('{End}');
    assert(splitter.getAttribute('aria-valuenow') === '75', 'End jumps to the maximum.');
  },
};

export const SecondaryOnStartSideContract: Story = {
  render: () => (
    <SplitterFixture maxSecondaryRatio={0.75} minSecondaryRatio={0.25} secondarySide="start" />
  ),
  play: async ({ canvas, userEvent }) => {
    const splitter = canvas.getByRole('separator', { name: 'Resize secondary panel' });
    splitter.focus();

    // W06: with Secondary on the start side, direction flips from the default-side contract above —
    // ArrowRight now grows Secondary's share instead of shrinking it.
    await userEvent.keyboard('{ArrowRight}');
    assert(
      Number(splitter.getAttribute('aria-valuenow')) > 50,
      'ArrowRight grows Secondary’s share when Secondary is on the start side.',
    );

    await userEvent.keyboard('{Home}');
    assert(splitter.getAttribute('aria-valuenow') === '25', 'Home still jumps to the minimum.');

    await userEvent.keyboard('{End}');
    assert(splitter.getAttribute('aria-valuenow') === '75', 'End still jumps to the maximum.');
  },
};
