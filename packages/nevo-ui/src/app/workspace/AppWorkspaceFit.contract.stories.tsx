import type { Meta, StoryObj } from '@storybook/react-vite';
import { Typography } from '../../components';
import { AppShell } from '../shell/AppShell';
import { AppContent, AppWorkspace, AppWorkspaceBody } from './AppWorkspace';
import { WorkspaceHeader } from './WorkspaceHeader';
import type { AppWorkspaceFit } from './workspaceSizing';

const viewports = {
  w390: { name: '390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  w1024: { name: '1024', styles: { width: '1024px', height: '768px' }, type: 'tablet' },
  w1280: { name: '1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
  w1366: { name: '1366', styles: { width: '1366px', height: '768px' }, type: 'desktop' },
  w1440: { name: '1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
  w1600: { name: '1600', styles: { width: '1600px', height: '900px' }, type: 'desktop' },
  w1920: { name: '1920', styles: { width: '1920px', height: '1080px' }, type: 'desktop' },
  w2560: { name: '2560', styles: { width: '2560px', height: '1440px' }, type: 'desktop' },
} as const;

function Navigation() {
  return (
    <div className="p-4">
      <Typography className="text-content-muted" variant="label-sm">
        Navigation
      </Typography>
    </div>
  );
}

function Rows({ label }: { label: string }) {
  return (
    <AppWorkspaceBody>
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="rounded-control border border-border-subtle bg-surface-subtle p-3"
            key={index}
          >
            <Typography className="text-content-secondary" variant="body-sm">
              {label} row {index + 1}
            </Typography>
          </div>
        ))}
      </div>
    </AppWorkspaceBody>
  );
}

const headerActions = [{ id: 'new', label: 'New item', primary: true, onPress: () => undefined }];

interface FitFixtureProps {
  fit: AppWorkspaceFit;
  secondary?: boolean;
  primaryMaxPx?: number;
}

function FitFixture({ fit, secondary = false, primaryMaxPx }: FitFixtureProps) {
  return (
    <AppShell navigation={<Navigation />}>
      <AppWorkspace
        fit={fit}
        split={primaryMaxPx ? 'secondary' : 'primary'}
        primaryMaxPx={primaryMaxPx}
      >
        <AppWorkspace.Primary
          header={<WorkspaceHeader actions={headerActions} title="Collection" />}
        >
          <AppContent className="w-content-standard max-w-full" data-fit-content="primary">
            <Rows label="Collection" />
          </AppContent>
        </AppWorkspace.Primary>
        {secondary ? (
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
            <AppContent className="w-full" data-fit-content="secondary">
              <Rows label="Context" />
            </AppContent>
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
    </AppShell>
  );
}

const meta = {
  title: 'Nevo UI/Layout/Workspace/Fit',
  component: FitFixture,
  parameters: { layout: 'fullscreen', viewport: { options: viewports } },
  args: { fit: 'bounded' },
  argTypes: { fit: { control: 'inline-radio', options: ['content', 'available', 'bounded'] } },
} satisfies Meta<typeof FitFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function settle() {
  for (let frame = 0; frame < 6; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function measure(canvasElement: HTMLElement, width: number) {
  await settle();
  assert(
    window.innerWidth === width,
    `Expected a ${width}px viewport, got ${window.innerWidth}px.`,
  );
  const main = canvasElement.querySelector<HTMLElement>('main[data-app-shell-region="workspace"]');
  const layout = canvasElement.querySelector<HTMLElement>('[data-workspace-fit]');
  const content = canvasElement.querySelector<HTMLElement>('[data-fit-content="primary"]');
  const navigation = canvasElement.querySelector<HTMLElement>(
    '[data-app-shell-region="navigation"]',
  );
  assert(main && layout && content, 'The fixture exposes workspace, layout and primary content.');
  const mainRect = main.getBoundingClientRect();
  const style = getComputedStyle(main);
  const borders =
    Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  return {
    mainRect,
    borders,
    layout,
    layoutRect: layout.getBoundingClientRect(),
    content,
    navigation,
  };
}

function assertCentredGroup(navigation: HTMLElement | null, mainRect: DOMRect) {
  assert(navigation, 'Wide layouts keep persistent navigation.');
  const left = navigation.getBoundingClientRect().left;
  const right = window.innerWidth - mainRect.right;
  assert(
    Math.abs(left - right) <= 1,
    `Navigation and workspace are centred as one group (${left} vs ${right}).`,
  );
}

function assertFillsWide(navigation: HTMLElement | null, mainRect: DOMRect, message: string) {
  assert(navigation, 'Wide layouts keep persistent navigation.');
  const expected = window.innerWidth - navigation.getBoundingClientRect().right;
  assert(mainRect.width >= expected - 16, `${message} (${mainRect.width} of ~${expected}).`);
}

function assertFullWidth(layoutRect: DOMRect, message: string) {
  assert(layoutRect.left >= 0 && layoutRect.right <= window.innerWidth + 0.5, message);
  assert(layoutRect.width >= window.innerWidth - 2 * layoutRect.left - 1, message);
}

const contentStandardPx = 68.75 * 16;

async function verifyBoundedWide(canvasElement: HTMLElement, width: number) {
  const { mainRect, borders, layout, content, navigation } = await measure(canvasElement, width);
  assert(
    layout.dataset.workspaceFit === 'content',
    'Bounded Primary-only resolves to a content fit.',
  );
  const contentWidth = content.getBoundingClientRect().width;
  assert(
    Math.abs(contentWidth - contentStandardPx) <= 1,
    `The Primary keeps content-standard width (${contentWidth}).`,
  );
  assert(
    Math.abs(mainRect.width - borders - contentWidth) <= 1,
    `The workspace is bounded to the Primary content (${mainRect.width} vs ${contentWidth}).`,
  );
  assertCentredGroup(navigation, mainRect);
}

export const BoundedPrimaryOnly: Story = {
  globals: { viewport: { value: 'w1920', isRotated: false } },
};

export const BoundedPrimaryOnly1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => verifyBoundedWide(canvasElement, 1440),
};

export const BoundedPrimaryOnly1920Contract: Story = {
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w1920', isRotated: false } },
  play: async ({ canvasElement }) => verifyBoundedWide(canvasElement, 1920),
};

export const BoundedPrimaryOnly2560Contract: Story = {
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w2560', isRotated: false } },
  play: async ({ canvasElement }) => verifyBoundedWide(canvasElement, 2560),
};

export const BoundedPrimaryOnly1024Contract: Story = {
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w1024', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { navigation, content, layoutRect } = await measure(canvasElement, 1024);
    assert(!navigation, 'At 1024 navigation is a drawer.');
    assertFullWidth(layoutRect, 'The bounded workspace spans the viewport in drawer mode.');
    assert(
      content.getBoundingClientRect().width <= layoutRect.width + 0.5,
      'The bounded Primary never exceeds the available width.',
    );
  },
};

export const BoundedPrimaryOnly390Contract: Story = {
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, layoutRect } = await measure(canvasElement, 390);
    assert(layout.dataset.workspaceFit === 'available', 'Stacked layouts fill.');
    assertFullWidth(layoutRect, 'Stacked layouts are full width.');
  },
};

export const BoundedWithSecondary1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { secondary: true },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, mainRect, navigation } = await measure(canvasElement, 1440);
    assert(
      layout.dataset.workspaceFit === 'content',
      'Bounded with a Secondary also fits content.',
    );
    assertCentredGroup(navigation, mainRect);
  },
};

export const ContentPrimaryOnly1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'content' },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, mainRect, navigation } = await measure(canvasElement, 1440);
    assert(layout.dataset.workspaceFit === 'available', 'Default content fit is unchanged.');
    assertFillsWide(navigation, mainRect, 'The default fit still fills a Primary-only workspace');
  },
};

export const AvailablePrimaryOnly1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available' },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, mainRect, navigation } = await measure(canvasElement, 1440);
    assert(layout.dataset.workspaceFit === 'available', 'Available always fills.');
    assertFillsWide(navigation, mainRect, 'Available fills without a Secondary');
  },
};

export const AvailableWithSecondary1024Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1024', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, layoutRect } = await measure(canvasElement, 1024);
    assert(layout.dataset.workspaceFit === 'available', 'Available always fills.');
    assert(
      canvasElement.querySelector('[data-fit-content="secondary"]'),
      'The Secondary is split beside the Primary.',
    );
    assertFullWidth(layoutRect, 'Available fills the drawer-mode workspace.');
  },
};

export const AvailableWithSecondary1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layout, mainRect, navigation } = await measure(canvasElement, 1440);
    assert(layout.dataset.workspaceFit === 'available', 'Available always fills.');
    assertFillsWide(navigation, mainRect, 'Available fills the split workspace');
  },
};

export const AvailableWithSecondary2560Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w2560', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { mainRect, navigation } = await measure(canvasElement, 2560);
    assertFillsWide(navigation, mainRect, 'Available fills at ultrawide');
  },
};

export const AvailableStacked390Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { layoutRect } = await measure(canvasElement, 390);
    assertFullWidth(layoutRect, 'Stacked layouts are full width.');
  },
};

/**
 * Regression: the shell published the workspace surface's border-box width, so primary + secondary
 * were as wide as the surface and overflowed its content box by the border width (the clipped
 * right-most region lost its last pixel). The sum of the slots must fit the surface content box.
 */
async function verifySecondaryFitsSurface(canvasElement: HTMLElement, width: number) {
  const { mainRect, layout, layoutRect } = await measure(canvasElement, width);
  const main = canvasElement.querySelector<HTMLElement>('main[data-app-shell-region="workspace"]')!;
  const style = getComputedStyle(main);
  const contentRight = mainRect.right - Number.parseFloat(style.borderRightWidth);
  const regions = [...layout.querySelectorAll<HTMLElement>('[data-workspace-surface]')];
  const primary = regions.find((region) => region.dataset.workspaceSurface === 'primary');
  const secondary = regions.find((region) => region.dataset.workspaceSurface === 'secondary');
  assert(primary && secondary, 'The fixture renders Primary and Secondary side by side.');
  const secondaryRect = secondary.getBoundingClientRect();
  assert(
    layoutRect.right <= contentRight + 0.01,
    `The slot group fits the surface content box (${layoutRect.right} vs ${contentRight}).`,
  );
  assert(
    secondaryRect.right <= layoutRect.right + 0.01,
    `The Secondary does not overflow the group (${secondaryRect.right} vs ${layoutRect.right}).`,
  );
  assert(
    Math.abs(primary.getBoundingClientRect().width + secondaryRect.width - layout.clientWidth) <=
      0.5,
    'Primary and Secondary widths add up to the group width.',
  );
}

export const SecondaryFitsSurface1280Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement }) => verifySecondaryFitsSurface(canvasElement, 1280),
};
export const SecondaryFitsSurface1366Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1366', isRotated: false } },
  play: async ({ canvasElement }) => verifySecondaryFitsSurface(canvasElement, 1366),
};
export const SecondaryFitsSurface1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => verifySecondaryFitsSurface(canvasElement, 1440),
};
export const SecondaryFitsSurface1600Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: { fit: 'available', secondary: true },
  globals: { viewport: { value: 'w1600', isRotated: false } },
  play: async ({ canvasElement }) => verifySecondaryFitsSurface(canvasElement, 1600),
};

/**
 * Opt-in `primaryMaxPx` with `split="secondary"` and `fit="available"`: Primary keeps its 25% share
 * up to the cap and Secondary takes the rest, so no width is left unused on very wide screens.
 */
async function verifyCappedPrimary(canvasElement: HTMLElement, width: number, cap: number) {
  const { layoutRect } = await measure(canvasElement, width);
  const primary = canvasElement.querySelector<HTMLElement>('[data-workspace-surface="primary"]');
  const secondary = canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"]',
  );
  assert(primary && secondary, 'Both regions are split side by side.');
  const primaryWidth = primary.getBoundingClientRect().width;
  const secondaryWidth = secondary.getBoundingClientRect().width;
  // Below the dominance width the split is 1/3 : 2/3 instead of 1/4 : 3/4.
  const share = layoutRect.width * (layoutRect.width < 1080 ? 1 / 3 : 0.25);
  assert(
    Math.abs(primaryWidth - Math.min(share, cap)) <= 1.5,
    `Primary is min(its share, ${cap}px): ${primaryWidth} (share ${share}).`,
  );
  assert(
    Math.abs(primaryWidth + secondaryWidth - layoutRect.width) <= 1.5,
    `Secondary takes the rest: ${primaryWidth} + ${secondaryWidth} of ${layoutRect.width}.`,
  );
}

const cappedArgs = { fit: 'available', secondary: true, primaryMaxPx: 360 } as const;

export const CappedPrimary1280Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: cappedArgs,
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement }) => verifyCappedPrimary(canvasElement, 1280, 360),
};
export const CappedPrimary1440Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: cappedArgs,
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement }) => verifyCappedPrimary(canvasElement, 1440, 360),
};
export const CappedPrimary1920Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: cappedArgs,
  globals: { viewport: { value: 'w1920', isRotated: false } },
  play: async ({ canvasElement }) => verifyCappedPrimary(canvasElement, 1920, 360),
};
export const CappedPrimary2560Contract: Story = {
  tags: ['contract', '!autodocs'],
  args: cappedArgs,
  globals: { viewport: { value: 'w2560', isRotated: false } },
  play: async ({ canvasElement }) => verifyCappedPrimary(canvasElement, 2560, 360),
};
