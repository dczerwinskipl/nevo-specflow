import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppContentContainer, AppWorkspaceBody } from '../../../app';
import { Typography } from '../../foundations/Typography';
import { AccentBlock } from './AccentBlock';

const meta = {
  title: 'Nevo UI/Surfaces/AccentBlock',
  component: AccentBlock,
  args: { children: 'A neutral grouping surface for content that needs attention.' },
} satisfies Meta<typeof AccentBlock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongContent: Story = {
  args: { children: 'A long instruction that wraps without hiding information. '.repeat(20) },
};

/** A workspace sheet of a given width: the body padding, a page title and the block under it. */
function Sheet({
  width,
  bleed,
  name,
}: {
  readonly width: number;
  readonly bleed: boolean | 'narrow';
  readonly name: string;
}) {
  return (
    <div
      className="border border-border-subtle bg-surface-raised"
      style={{ width }}
      data-sheet={name}
    >
      <AppWorkspaceBody tabIndex={-1}>
        <AppContentContainer align="start" size="full" className="grid gap-4">
          <Typography as="h3" variant="title-sm" data-gutter-reference="">
            Sign-in screen with the SSO button
          </Typography>
          <AccentBlock bleed={bleed} data-block="">
            <div className="grid gap-2">
              <Typography as="h4" variant="section-label">
                Now
              </Typography>
              <Typography as="p" variant="title-sm" data-band-text="">
                Break the solution down
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                In progress since 11:18 · started by you
              </Typography>
            </div>
          </AccentBlock>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            The next section starts here.
          </Typography>
        </AppContentContainer>
      </AppWorkspaceBody>
    </div>
  );
}

function BleedFixture() {
  return (
    <div className="grid gap-6">
      <Sheet name="narrow-390" width={390} bleed="narrow" />
      <Sheet name="narrow-834" width={834} bleed="narrow" />
      <Sheet name="always-834" width={834} bleed />
    </div>
  );
}

/**
 * `bleed` turns the card into a flush band across the `AppWorkspaceBody` padding. `bleed="narrow"`
 * does that only while the page content container is narrower than 40rem (here: the 390 sheet), and
 * keeps the card above it (the 834 sheet). `bleed` always bleeds (the last sheet).
 */
export const Bleed: Story = {
  render: () => <BleedFixture />,
  parameters: { layout: 'padded', controls: { disable: true } },
};

function edgesOf(canvasElement: HTMLElement, name: string) {
  const sheet = canvasElement.querySelector<HTMLElement>(`[data-sheet="${name}"]`)!;
  const block = sheet.querySelector<HTMLElement>('[data-block]')!;
  const text = block.querySelector<HTMLElement>('[data-band-text]')!;
  const gutter = sheet.querySelector<HTMLElement>('[data-gutter-reference]')!;
  const sheetBox = sheet.getBoundingClientRect();
  // The sheet's 1 px border is outside the body; measure from the body's edges.
  const inner = { left: sheetBox.left + 1, right: sheetBox.right - 1 };

  return {
    blockLeft: block.getBoundingClientRect().left - inner.left,
    blockRight: inner.right - block.getBoundingClientRect().right,
    textLeft: text.getBoundingClientRect().left - inner.left,
    textRight: inner.right - text.getBoundingClientRect().right,
    gutterLeft: gutter.getBoundingClientRect().left - inner.left,
  };
}

function near(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 0.5) {
    throw new Error(`${message} (expected ${expected}, got ${actual}).`);
  }
}

export const BleedGeometryContract: Story = {
  tags: ['contract', '!autodocs'],
  render: () => <BleedFixture />,
  parameters: { layout: 'padded', controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const narrow = edgesOf(canvasElement, 'narrow-390');
    near(narrow.blockLeft, 0, 'Below 40rem the band starts at the sheet edge');
    near(narrow.blockRight, 0, 'Below 40rem the band ends at the sheet edge');
    near(narrow.textLeft, narrow.gutterLeft, 'The band text lines up with the page gutter');
    near(narrow.textLeft, 16, 'The gutter is the body padding');
    near(narrow.textRight, 16, 'The band keeps the gutter on the right');

    const wide = edgesOf(canvasElement, 'narrow-834');
    near(wide.blockLeft, 16, 'From 40rem the card sits inside the body padding');
    near(wide.textLeft, 16 + 3 + 16, 'The card keeps its own inset');

    const always = edgesOf(canvasElement, 'always-834');
    near(always.blockLeft, 0, 'bleed always spans the body padding');
    near(always.textLeft, always.gutterLeft, 'bleed lines the text up with the gutter');
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['AccentBlock']}>
      <AccentBlock
        data-design-canonical="true"
        data-design-source-id="default"
        className="w-content-narrow"
      >
        Content requiring attention
      </AccentBlock>
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'AccentBlock',
      title: 'AccentBlock',
      description: 'Neutral content grouping with a continuous primary accent on the left.',
      kind: 'component',
      order: 75,
    },
  },
};
