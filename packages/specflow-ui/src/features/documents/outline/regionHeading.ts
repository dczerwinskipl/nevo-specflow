const heading = '[data-workspace-header-title="true"]';

/**
 * The heading of the document region: the one in the active Secondary surface when there is one
 * (a stacked layout has several surfaces), else any region heading on the page. Two queries in
 * order, not one selector list, which would return whichever matching element comes first.
 */
export function regionHeading(root: ParentNode = document): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>(
      `[data-workspace-surface="secondary"][data-workspace-active="true"] ${heading}`,
    ) ?? root.querySelector<HTMLElement>(heading)
  );
}
