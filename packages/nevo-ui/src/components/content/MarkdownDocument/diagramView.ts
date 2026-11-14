/**
 * Pure geometry of a zoomable diagram: the content (the drawing at its natural size) is shown in a
 * box at `scale`, offset by `x`/`y` from the box's top-left corner. Every function returns a view
 * that is inside the zoom range and the pan bounds.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface DiagramView {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Inline text never shrinks below 10 px: the drawing's labels are 14 px at natural size. */
export const minimumInlineScale = 10 / 14;
/** The largest zoom, as a multiple of the natural size. */
export const maximumScale = 4;
/** One zoom step (buttons, `+`/`-`). */
export const zoomStep = 1.25;
/** One pan step of the arrow keys, in screen pixels. */
export const panStep = 48;

/**
 * The scale a diagram opens at.
 * - `inline` (in the document): its natural size when it fits the column (never larger), else
 *   fitted to the column but never below `minimumInlineScale` (the rest pans).
 * - `window` (full screen): the whole drawing fitted to the box, never larger than natural size.
 */
export function fitScale(content: Size, box: Size, mode: 'inline' | 'window'): number {
  if (content.width <= 0 || content.height <= 0 || box.width <= 0) {
    return 1;
  }

  if (mode === 'inline') {
    return content.width <= box.width ? 1 : Math.max(box.width / content.width, minimumInlineScale);
  }

  return box.height <= 0
    ? Math.min(1, box.width / content.width)
    : Math.min(1, box.width / content.width, box.height / content.height);
}

export interface DiagramGeometry {
  readonly content: Size;
  readonly box: Size;
  /** The scale the diagram opens at and returns to on reset; also the smallest zoom. */
  readonly fit: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function scaleRange(fit: number): { min: number; max: number } {
  return { min: fit, max: Math.max(maximumScale, fit) };
}

/** One axis: content smaller than the box is centred; larger content may not leave a gap. */
function clampOffset(offset: number, content: number, box: number): number {
  return content <= box ? (box - content) / 2 : clamp(offset, box - content, 0);
}

/** The view inside the zoom range and the pan bounds. */
export function clampView(view: DiagramView, geometry: DiagramGeometry): DiagramView {
  const { min, max } = scaleRange(geometry.fit);
  const scale = clamp(view.scale, min, max);

  return {
    scale,
    x: clampOffset(view.x, geometry.content.width * scale, geometry.box.width),
    y: clampOffset(view.y, geometry.content.height * scale, geometry.box.height),
  };
}

/** The opening view: the fit scale, the drawing centred (or its start shown when it pans). */
export function fitView(geometry: DiagramGeometry): DiagramView {
  return clampView({ scale: geometry.fit, x: 0, y: 0 }, geometry);
}

/** Zooms by `factor` keeping `point` (box coordinates) on the same spot of the drawing. */
export function zoomAt(
  view: DiagramView,
  factor: number,
  point: Point,
  geometry: DiagramGeometry,
): DiagramView {
  const { min, max } = scaleRange(geometry.fit);
  const scale = clamp(view.scale * factor, min, max);
  const ratio = scale / view.scale;

  return clampView(
    { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio },
    geometry,
  );
}

/** Moves the drawing by `dx`/`dy` screen pixels. */
export function panBy(
  view: DiagramView,
  dx: number,
  dy: number,
  geometry: DiagramGeometry,
): DiagramView {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, geometry);
}

export function boxCentre(geometry: DiagramGeometry): Point {
  return { x: geometry.box.width / 2, y: geometry.box.height / 2 };
}

/**
 * The keyboard of a focused diagram: `+`/`-` zoom about the centre, the arrows move the view
 * (the drawing moves the other way), `0` resets. `undefined` for any other key.
 */
export function viewForKey(
  key: string,
  view: DiagramView,
  geometry: DiagramGeometry,
): DiagramView | 'reset' | undefined {
  switch (key) {
    case '+':
    case '=':
      return zoomAt(view, zoomStep, boxCentre(geometry), geometry);
    case '-':
    case '_':
      return zoomAt(view, 1 / zoomStep, boxCentre(geometry), geometry);
    case '0':
      return 'reset';
    case 'ArrowLeft':
      return panBy(view, panStep, 0, geometry);
    case 'ArrowRight':
      return panBy(view, -panStep, 0, geometry);
    case 'ArrowUp':
      return panBy(view, 0, panStep, geometry);
    case 'ArrowDown':
      return panBy(view, 0, -panStep, geometry);
    default:
      return undefined;
  }
}

/** The natural size of a drawing from its `viewBox` (Mermaid always writes one). */
export function naturalSize(svg: string): Size {
  const match = /<svg[^>]*\sviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(
    svg,
  );

  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
}
