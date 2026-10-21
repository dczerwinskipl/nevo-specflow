import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AlertDialogFooter } from '../../overlays/AlertDialog';
import { Button, type ButtonLabelOverflow } from './Button';

const meta = {
  title: 'Nevo UI/Actions/Button/Label overflow',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const longLabel = 'Utwórz specyfikację i od razu otwórz sesję agenta w nowym workspace';
const modes: ButtonLabelOverflow[] = ['wrap', 'truncate', 'nowrap'];

function Narrow({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div
      data-testid={`box-${width}`}
      className="flex border border-dashed border-border-default"
      style={{ width }}
    >
      {children}
    </div>
  );
}

export const LongLabelNarrow: Story = {
  render: () => (
    <div className="grid gap-6">
      {[240, 288, 320].flatMap((width) =>
        modes.map((mode) => (
          <div key={`${width}-${mode}`} data-testid={`${mode}-${width}`}>
            <Narrow width={width}>
              <Button labelOverflow={mode} width="full">
                {longLabel}
              </Button>
            </Narrow>
          </div>
        )),
      )}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const width of [240, 288, 320]) {
      const wrapBox = canvas.getByTestId(`wrap-${width}`);
      const wrapButton = wrapBox.querySelector('button')!;
      const label = wrapButton.querySelector('[data-design-slot="label"]')!;
      assert(wrapButton.getBoundingClientRect().height > 36, `wrap@${width}: grows taller.`);
      assert(
        wrapButton.getBoundingClientRect().width <= width + 0.5,
        `wrap@${width}: stays within its container.`,
      );
      assert(label.scrollWidth <= label.clientWidth + 1, `wrap@${width}: no horizontal spill.`);

      const truncateButton = canvas.getByTestId(`truncate-${width}`).querySelector('button')!;
      const truncated = truncateButton.querySelector('[data-design-slot="label"]')!;
      assert(truncateButton.getBoundingClientRect().height === 36, `truncate@${width}: 36px.`);
      assert(truncated.scrollWidth > truncated.clientWidth, `truncate@${width}: ellipsised.`);
      assert(
        truncateButton.getBoundingClientRect().width <= width + 0.5,
        `truncate@${width}: within container.`,
      );

      const nowrapButton = canvas.getByTestId(`nowrap-${width}`).querySelector('button')!;
      assert(nowrapButton.getBoundingClientRect().height === 36, `nowrap@${width}: 36px.`);
    }
  },
};

export const SingleLineHeightParity: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button>Save</Button>
      <Button size="sm">Save</Button>
      <Button leadingIcon="search">Search</Button>
      <Button size="sm" trailingIcon="arrow-right">
        Next
      </Button>
      <Button variant="secondary" disabled>
        Disabled
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const buttons = canvas.getAllByRole('button');
    const heights = buttons.map((button) => button.getBoundingClientRect().height);
    assert(
      heights[0] === 36 && heights[2] === 36 && heights[4] === 36,
      `md is 36: ${heights.join()}`,
    );
    assert(heights[1] === 32 && heights[3] === 32, `sm is 32: ${heights.join()}`);
  },
};

export const IconTextWrap: Story = {
  render: () => (
    <Narrow width={260}>
      <Button leadingIcon="plus" trailingIcon="arrow-right" width="full">
        {longLabel}
      </Button>
    </Narrow>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button');
    const icons = button.querySelectorAll('[data-design-slot$="Icon"]');
    assert(icons.length === 2, 'Both icons render.');
    for (const icon of icons)
      assert(icon.getBoundingClientRect().width >= 18, 'Icons never shrink while the label wraps.');
  },
};

export const FullWidthLong: Story = {
  render: () => (
    <div className="w-60 border border-dashed border-border-default p-2">
      <AlertDialogFooter>
        <Button variant="secondary">Anuluj</Button>
        <Button>{longLabel}</Button>
      </AlertDialogFooter>
    </div>
  ),
  play: async ({ canvas }) => {
    const buttons = canvas.getAllByRole('button');
    const container = buttons[0]!.parentElement!.getBoundingClientRect();
    for (const button of buttons)
      assert(button.getBoundingClientRect().right <= container.right + 0.5, 'Inside the footer.');
  },
};

function LoadingLabelSwapExample() {
  const [busy, setBusy] = useState(false);
  return (
    <Button disabled={busy} onClick={() => setBusy(true)}>
      {busy ? 'Saving' : 'Save'}
    </Button>
  );
}

export const LoadingLabelSwap: Story = {
  render: () => <LoadingLabelSwapExample />,
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button');
    const before = button.getBoundingClientRect().height;
    await userEvent.click(button);
    assert(button.hasAttribute('disabled'), 'The busy state is the native disabled state.');
    assert(button.getBoundingClientRect().height === before, 'Swapping the label keeps height.');
    assert(getComputedStyle(button).pointerEvents === 'none', 'Disabled blocks pointer events.');
  },
};
