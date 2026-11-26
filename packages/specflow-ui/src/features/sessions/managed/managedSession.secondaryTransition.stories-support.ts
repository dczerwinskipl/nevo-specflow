import { expect } from 'storybook/test';

/**
 * The phone's slide-in of a Secondary (Work history, Context) painted as two offset, see-through
 * copies when something scrolled an ancestor of the sliding surface against its transform (#67,
 * and again from Work history's scroll to a stage). Records, every frame while `open` runs and
 * until the workspace is idle, which ancestors of a workspace surface are scrolled; then requires
 * none ever was, and one opaque Secondary alone on screen once the slide ends.
 */
export async function expectOneOpaqueSecondaryAfter(open: () => Promise<void>) {
  const scrolled = new Set<string>();
  let sampling = true;
  const sample = () => {
    for (const surface of document.querySelectorAll<HTMLElement>('[data-workspace-surface]')) {
      for (let node = surface.parentElement; node; node = node.parentElement) {
        if (node.scrollLeft !== 0 || node.scrollTop !== 0) {
          scrolled.add(`${node.tagName}.${node.className.toString().split(' ')[0]}`);
        }
      }
    }

    if (sampling) {
      requestAnimationFrame(sample);
    }
  };

  requestAnimationFrame(sample);
  const visible = () =>
    [...document.querySelectorAll<HTMLElement>('[data-workspace-surface]')].filter(
      (surface) => getComputedStyle(surface).display !== 'none',
    );
  try {
    await open();
    const deadline = performance.now() + 3000;
    let idleFrames = 0;
    while (performance.now() < deadline && idleFrames < 5) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const surfaces = visible();
      idleFrames =
        surfaces.length === 1 &&
        surfaces[0]!.dataset.workspaceSurface === 'secondary' &&
        surfaces[0]!.dataset.workspaceMotion === 'idle'
          ? idleFrames + 1
          : 0;
    }
  } finally {
    sampling = false;
  }

  await expect([...scrolled], 'no ancestor of a sliding surface is scrolled').toEqual([]);
  const surfaces = visible();
  await expect(
    surfaces.map((surface) => surface.dataset.workspaceSurface),
    'one Secondary on screen after the slide',
  ).toEqual(['secondary']);
  await expect(
    document.querySelectorAll('[data-workspace-role="outgoing"]'),
    'no outgoing layer left',
  ).toHaveLength(0);
  const background = getComputedStyle(surfaces[0]!).backgroundColor;
  const alpha = /^rgba\(.*,\s*([\d.]+)\)$/.exec(background)?.[1];
  await expect(
    background.startsWith('rgb(') || alpha === '1',
    `the Secondary is opaque (${background})`,
  ).toBe(true);
}
