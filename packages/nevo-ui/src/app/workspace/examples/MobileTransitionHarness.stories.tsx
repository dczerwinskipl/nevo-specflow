import type { Meta, StoryObj } from '@storybook/react-vite';
import { SecondaryStackExample } from './SecondaryStackExample';

const meta = {
  title: 'Nevo UI/Workspace/Mobile transition harness',
  component: SecondaryStackExample,
  parameters: { layout: 'fullscreen' },
  args: { width: 390, closeBehavior: 'page' },
  tags: ['!autodocs'],
} satisfies Meta<typeof SecondaryStackExample>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface FrameSample {
  surfaces: { surface: string; role: string; motion: string; interactive: boolean }[];
  scrolled: string[];
}

/**
 * Samples every animation frame while `action` runs and until the workspace is idle again.
 * Ghosting on Android Chrome came from the workspace container being scrolled against the running
 * transform, which a DOM-state assertion alone cannot see, so every frame also records the scroll
 * offsets of all ancestors of the mobile surfaces.
 */
async function sampleTransition(root: HTMLElement, action: () => Promise<void>) {
  const frames: FrameSample[] = [];
  let sampling = true;
  const sample = () => {
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-workspace-surface]')];
    const scrolled = new Set<string>();
    for (const node of nodes) {
      for (
        let el = node.parentElement;
        el && el !== root.ownerDocument.body;
        el = el.parentElement
      ) {
        if (el.scrollLeft !== 0 || el.scrollTop !== 0) {
          scrolled.add(`${el.className.toString().split(' ')[0]}@${el.scrollLeft}/${el.scrollTop}`);
        }
      }
    }
    frames.push({
      surfaces: nodes
        .filter((node) => getComputedStyle(node).display !== 'none')
        .map((node) => ({
          surface: node.dataset.workspaceSurface ?? '',
          role: node.dataset.workspaceRole ?? '',
          motion: node.dataset.workspaceMotion ?? '',
          interactive: !node.inert,
        })),
      scrolled: [...scrolled],
    });
    if (sampling) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  await action();

  const deadline = performance.now() + 2000;
  let idleFrames = 0;
  while (performance.now() < deadline && idleFrames < 5) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const last = frames.at(-1);
    idleFrames = last?.surfaces.every((s) => s.motion === 'idle') ? idleFrames + 1 : 0;
  }
  sampling = false;
  return frames;
}

function assertCleanTransition(name: string, frames: FrameSample[]) {
  assert(frames.length > 0, `${name}: no frames sampled`);
  for (const [index, frame] of frames.entries()) {
    assert(
      frame.scrolled.length === 0,
      `${name}: frame ${index} scrolled the workspace against the transform (${frame.scrolled.join(', ')})`,
    );
    assert(
      frame.surfaces.filter((s) => s.interactive).length <= 1,
      `${name}: frame ${index} exposes more than one interactive surface`,
    );
    assert(
      frame.surfaces.filter((s) => s.surface === 'secondary').length <= 2,
      `${name}: frame ${index} mounts more than incoming + outgoing Secondary`,
    );
  }
  const settled = frames.at(-1)!;
  assert(
    settled.surfaces.filter((s) => s.interactive).length === 1,
    `${name}: exactly one surface must be interactive once the workspace settles`,
  );
  assert(
    settled.surfaces.every((s) => s.role !== 'outgoing' && s.motion === 'idle'),
    `${name}: an outgoing or animating layer survived the transition`,
  );
}

export const NarrowTransitionsStayAligned: Story = {
  tags: ['contract'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const click = (name: string) => () => userEvent.click(canvas.getByRole('button', { name }));

    const push = await sampleTransition(canvasElement, click('Review navigation'));
    assertCleanTransition('Primary -> Secondary', push);
    assert(
      push.some((f) =>
        f.surfaces.some((s) => s.surface === 'secondary' && s.motion === 'entering'),
      ),
      'Primary -> Secondary must animate the incoming Secondary',
    );
    assert(
      !push.some((f) => f.surfaces.some((s) => s.surface === 'secondary' && s.role === 'outgoing')),
      'Primary -> Secondary must not create an outgoing Secondary',
    );

    assertCleanTransition(
      'Secondary -> Secondary',
      await sampleTransition(canvasElement, click('Todo history')),
    );
    assertCleanTransition('Back', await sampleTransition(canvasElement, click('Back')));
    assertCleanTransition(
      'Close',
      await sampleTransition(canvasElement, click('Close secondary content')),
    );
  },
};

/**
 * A real tap never focuses a control that is still off-screen, and pointer focus does not scroll.
 * `userEvent.click` focuses programmatically, which would scroll the workspace by itself, so rapid
 * input waits for the target to be on-screen and uses the native click.
 */
async function tapWhenOnScreen(root: HTMLElement, name: string) {
  const deadline = performance.now() + 2000;
  for (;;) {
    const width = root.ownerDocument.documentElement.clientWidth;
    const button = [...root.querySelectorAll<HTMLElement>('button')].find((candidate) => {
      const label = candidate.getAttribute('aria-label') ?? candidate.textContent?.trim();
      const rect = candidate.getBoundingClientRect();
      return (
        label === name && rect.left >= 0 && rect.right <= width && !candidate.closest('[inert]')
      );
    });
    if (button) {
      button.click();
      return;
    }
    assert(performance.now() < deadline, `"${name}" never became tappable`);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export const NarrowRapidTransitionsStayAligned: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const rapid = await sampleTransition(canvasElement, async () => {
      await tapWhenOnScreen(canvasElement, 'Review navigation');
      await tapWhenOnScreen(canvasElement, 'Todo history');
      await tapWhenOnScreen(canvasElement, 'Back');
      await tapWhenOnScreen(canvasElement, 'Back');
    });
    assertCleanTransition('Rapid push/back', rapid);
  },
};

export const Narrow: Story = {};
