import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from '../shell/AppShell';
import { AppWorkspaceProvider, useSecondaryNavigation } from './WorkspaceContext';
import { defineSecondaryStack } from './SecondaryStack';
import { AppWorkspace } from './AppWorkspace';
import { WorkspaceHeader } from './WorkspaceHeader';
import { AppContent } from './AppContent';
function BoundedContent() {
  return <EditorContent />;
}
function EditorContent({ hiddenInput = false }: { hiddenInput?: boolean }) {
  return (
    <AppContent>
      <div className="flex h-full min-h-0 flex-col">
        <div data-document-bar className="shrink-0 p-4">
          Source · Editing
        </div>
        <div data-editor-scroll tabIndex={0} className="min-h-0 flex-1 overflow-auto p-4">
          {Array.from({ length: 100 }, (_, i) => (
            <p key={i}>Markdown source line {i}</p>
          ))}
          {hiddenInput ? <input className="sr-only" aria-label="Hidden far input" /> : null}
        </div>
        <footer className="shrink-0 p-4">
          <button>Save document</button>
        </footer>
      </div>
    </AppContent>
  );
}
const boundedStack = defineSecondaryStack<
  Record<string, never>,
  Record<string, never>,
  { editor: Record<string, never> }
>({
  id: 'bounded-content-regression',
  initial: 'editor',
  useData: () => ({ status: 'ready', data: {} }),
  screens: {
    editor: { title: 'Retained editor', preserveOnDataLoss: true, component: BoundedContent },
  },
});
function OpenEditor() {
  const navigation = useSecondaryNavigation();
  return (
    <button onClick={() => void navigation.open(boundedStack, {})}>Open retained editor</button>
  );
}
function BoundedFixture({
  scroll = 'content',
  secondary = false,
  hiddenInput = false,
}: {
  scroll?: 'content' | 'workspace';
  secondary?: boolean;
  hiddenInput?: boolean;
}) {
  return (
    <div style={{ width: 320, height: 740 }} data-bounded-shell>
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Navigation</div>} style={{ height: '100%', width: '100%' }}>
          <AppWorkspace fit="available" scroll={scroll}>
            <AppWorkspace.Primary header={<WorkspaceHeader title="Editor" />}>
              {secondary ? <OpenEditor /> : <EditorContent hiddenInput={hiddenInput} />}
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
      </AppWorkspaceProvider>
    </div>
  );
}
const meta = {
  title: 'Nevo UI/Workspace/Content scroll ownership',
  component: BoundedFixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BoundedFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function assertBounded(canvasElement: HTMLElement, save: HTMLElement) {
  const shell = canvasElement.querySelector<HTMLElement>('[data-bounded-shell]')!;
  const content = canvasElement.querySelector<HTMLElement>('[data-editor-scroll]')!;
  const bar = canvasElement.querySelector<HTMLElement>('[data-document-bar]')!;
  assert(
    !canvasElement.querySelector('.mobile-workspace-scroll'),
    'Content mode must remove the outer mobile scroll owner',
  );
  assert(
    content.scrollHeight > content.clientHeight,
    'Editor must have bounded internal scrolling',
  );
  const before = bar.getBoundingClientRect().top,
    bounds = shell.getBoundingClientRect();
  assert(save.getBoundingClientRect().bottom <= bounds.bottom, 'Save must remain visible');
  content.scrollTop = 500;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  assert(
    bar.getBoundingClientRect().top === before,
    'Identity must stay fixed during content scroll',
  );
  assert(
    save.getBoundingClientRect().bottom <= bounds.bottom,
    'Save must stay visible after scrolling',
  );
}
export const BoundedMobileEditor: Story = {
  play: async ({ canvas, canvasElement }) => {
    await assertBounded(canvasElement, canvas.getByRole('button', { name: 'Save document' }));
  },
};
export const BoundedRetainedSecondary: Story = {
  args: { secondary: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open retained editor' }));
    const save = await canvas.findByRole('button', { name: 'Save document' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await assertBounded(canvasElement, save);
  },
};
export const WorkspaceScrollDefault: Story = {
  args: { scroll: 'workspace' },
  play: ({ canvasElement }) => {
    assert(
      canvasElement.querySelector('.mobile-workspace-scroll'),
      'Workspace mode must retain the existing mobile scroll owner',
    );
  },
};
/**
 * Regression: a visually hidden (absolute) native input that is not contained by its own
 * positioned ancestor makes the browser scroll the overflow-hidden workspace surface on focus,
 * shifting the whole panel and leaving an empty area below it. Workspace surfaces clip, they never scroll.
 */
export const FocusDoesNotScrollWorkspaceSurface: Story = {
  args: { hiddenInput: true },
  play: ({ canvas, canvasElement }) => {
    const input = canvas.getByLabelText('Hidden far input');
    input.focus();
    const offenders = [...canvasElement.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        element.scrollTop !== 0 &&
        ['hidden', 'clip'].includes(getComputedStyle(element).overflowY) &&
        !element.hasAttribute('data-editor-scroll'),
    );
    assert(
      offenders.length === 0,
      `Focus scrolled non-scrolling workspace containers: ${offenders.map((e) => e.className).join(' | ')}`,
    );
  },
};

function AnchorFixture({ width = 390 }: { width?: number }) {
  return (
    <AppShell navigation={<div>Navigation</div>} style={{ height: 844, width }}>
      <AppWorkspace>
        <AppWorkspace.Primary header={<WorkspaceHeader title="Document title" />}>
          <div className="p-4" data-anchor-page>
            <h1>Overview</h1>
            {Array.from({ length: 30 }, (_, i) => (
              <p key={i}>Section above the anchor, line {i}</p>
            ))}
            <h2 id="tasks-heading" tabIndex={-1}>
              Tasks
            </h2>
            {Array.from({ length: 60 }, (_, i) => (
              <p key={i}>Task row {i}</p>
            ))}
          </div>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppShell>
  );
}

async function frame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  // The floating row fades/slides in; measure it only once its transition has finished.
  await Promise.all(
    document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
  );
}

function overlayBottom(canvasElement: HTMLElement) {
  const buttons = [
    ...canvasElement.querySelectorAll<HTMLElement>('.mobile-floating-navigation > button'),
  ];
  assert(buttons.length > 0, 'The stacked workspace should expose the floating navigation row.');
  return Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom));
}

/** Anchors, scrollIntoView and hash navigation clear the floating hamburger row (WCAG 2.4.11). */
export const AnchorsClearFloatingNavigation: Story = {
  render: () => <AnchorFixture />,
  play: async ({ canvasElement }) => {
    const target = canvasElement.querySelector<HTMLElement>('#tasks-heading')!;
    const viewport = canvasElement.querySelector<HTMLElement>('.mobile-workspace-scroll')!;
    const inset = getComputedStyle(viewport).scrollPaddingTop;
    assert(inset !== 'auto' && parseFloat(inset) >= 48, `scroll-padding-top is set: ${inset}`);

    target.scrollIntoView({ block: 'start' });
    await frame();
    assert(
      target.getBoundingClientRect().top >= overlayBottom(canvasElement) - 0.5,
      `scrollIntoView lands below the floating row (${target.getBoundingClientRect().top}).`,
    );

    viewport.scrollTop = 0;
    await frame();
    window.location.hash = 'tasks-heading';
    await frame();
    assert(
      target.getBoundingClientRect().top >= overlayBottom(canvasElement) - 0.5,
      `Hash navigation lands below the floating row (${target.getBoundingClientRect().top}).`,
    );
    history.replaceState(null, '', window.location.pathname + window.location.search);
  },
};

/** The inset is derived from the same expression as the row, so a safe-area / rotated inset follows. */
export const AnchorInsetFollowsSafeArea: Story = {
  render: () => (
    <>
      <style>{`.mobile-workspace-scroll-area, .mobile-floating-navigation { --workspace-overlay-top: 2.75rem; }`}</style>
      <AnchorFixture />
    </>
  ),
  play: async ({ canvasElement }) => {
    const target = canvasElement.querySelector<HTMLElement>('#tasks-heading')!;
    target.scrollIntoView({ block: 'start' });
    await frame();
    const bottom = overlayBottom(canvasElement);
    assert(bottom >= 44 + 36 - 1, `The row moved down with the safe area (${bottom}).`);
    assert(target.getBoundingClientRect().top >= bottom - 0.5, 'The anchor still clears the row.');
  },
};

export const AnchorsClearFloatingNavigationAt320: Story = {
  render: () => <AnchorFixture width={320} />,
  play: async ({ canvasElement }) => {
    const target = canvasElement.querySelector<HTMLElement>('#tasks-heading')!;
    target.scrollIntoView({ block: 'start' });
    await frame();
    assert(
      target.getBoundingClientRect().top >= overlayBottom(canvasElement) - 0.5,
      'The anchor clears the floating row at 320px.',
    );
  },
};
