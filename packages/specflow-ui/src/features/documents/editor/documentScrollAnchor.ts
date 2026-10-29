/**
 * One logical scroll anchor shared by the source editor and the rendered preview of a document.
 * `line` is the 1-based source line at the top edge of the view and `offset` (0..1) how much of that
 * line (editor) or of that line's share of its rendered block (preview) is already scrolled past.
 * `ratio` is the proportional fallback used when a view has no line map (plain text).
 */
export interface ScrollAnchor {
  line?: number;
  offset: number;
  ratio: number;
}

export const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function ratioOf(scrollTop: number, scrollHeight: number, clientHeight: number) {
  const room = scrollHeight - clientHeight;
  return room > 0 ? clamp01(scrollTop / room) : 0;
}

/** Keeps a remembered anchor valid after the document lost lines. */
export function clampAnchor(anchor: ScrollAnchor, lineCount: number): ScrollAnchor {
  const line =
    anchor.line === undefined ? undefined : Math.min(Math.max(1, anchor.line), lineCount);
  return {
    line,
    offset: anchor.line !== undefined && anchor.line > lineCount ? 0 : clamp01(anchor.offset),
    ratio: clamp01(anchor.ratio),
  };
}

/** A rendered block that knows the source line it starts on. */
export interface MappedBlock {
  line: number;
  /** Top edge relative to the scroller's visible top (negative once scrolled past it). */
  top: number;
  height: number;
  /** Source lines the block spans (>= 1). */
  span: number;
}

/** The block crossing the top edge of the view: the last one starting at or above it. */
export function blockAtTop(blocks: readonly MappedBlock[]): MappedBlock | undefined {
  let found: MappedBlock | undefined;
  for (const block of blocks) if (block.top <= 1) found = block;
  return found ?? blocks[0];
}

/** Preview side: anchor of the view whose top edge is `blocks[i].top === 0`. */
export function anchorFromBlocks(
  blocks: readonly MappedBlock[],
  ratio: number,
): ScrollAnchor | undefined {
  const block = blockAtTop(blocks);
  if (!block) return undefined;
  const through = block.height > 0 ? clamp01(-block.top / block.height) : 0;
  const position = block.line + through * block.span;
  const line = Math.floor(position);
  return { line, offset: clamp01(position - line), ratio };
}

/** Preview side: which block holds `line`, and how far into it (0..1) the anchor falls. */
export function blockForLine(
  blocks: readonly MappedBlock[],
  line: number,
  offset: number,
): { block: MappedBlock; through: number } | undefined {
  let block: MappedBlock | undefined;
  for (const candidate of blocks) if (candidate.line <= line) block = candidate;
  block ??= blocks[0];
  if (!block) return undefined;
  const through = clamp01((line + offset - block.line) / Math.max(1, block.span));
  return { block, through };
}

const INPUT_EVENTS = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const;
/** A resize (mobile keyboard, rotation) re-lays the document out: scrolls right after it are not the user's. */
const RESIZE_QUIET_MS = 700;
/** A wheel or touch-drag is the user scrolling, even right after a resize (a tap that opens the keyboard is not). */
const GESTURE_WINDOW_MS = 400;

/**
 * Reports an anchor whenever the view scrolls, except in the quiet window after a window or visual
 * viewport resize (mobile keyboard, rotation), which never reaches `save`.
 */
export function trackUserScroll(
  scroller: HTMLElement,
  read: () => ScrollAnchor | undefined,
  save: (anchor: ScrollAnchor) => void,
): () => void {
  let quietUntil = 0;
  let lastGesture = Number.NEGATIVE_INFINITY;
  let frame = 0;
  const quiet = () =>
    performance.now() < quietUntil && performance.now() - lastGesture > GESTURE_WINDOW_MS;
  const flush = () => {
    const anchor = read();
    if (anchor) save(anchor);
  };
  const onResize = () => (quietUntil = performance.now() + RESIZE_QUIET_MS);
  // Leading edge saves at once (a resize right after a scroll must not lose it); the trailing
  // frame catches the rest of a scroll burst without measuring on every event.
  const onGesture = () => (lastGesture = performance.now());
  const onScroll = () => {
    if (quiet()) return;
    if (frame) return;
    flush();
    // The trailing read runs after the editor's own measure pass, so estimated heights are settled.
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!quiet()) flush();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  scroller.addEventListener('wheel', onGesture, { passive: true });
  scroller.addEventListener('touchmove', onGesture, { passive: true });
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  return () => {
    scroller.removeEventListener('scroll', onScroll);
    scroller.removeEventListener('wheel', onGesture);
    scroller.removeEventListener('touchmove', onGesture);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    cancelAnimationFrame(frame);
  };
}

/** The longest a restore keeps re-applying a position the layout has not settled on (frames). */
export const RESTORE_MAX_FRAMES = 30;

/** Two anchors name the same place: the same line and (almost) the same offset, else the same ratio. */
export function sameAnchor(read: ScrollAnchor | undefined, target: ScrollAnchor): boolean {
  if (!read) return false;
  if (target.line === undefined) return Math.abs(read.ratio - target.ratio) < 0.01;
  return read.line === target.line && Math.abs(read.offset - target.offset) < 0.05;
}

/**
 * Restores a position as ours, and stops as soon as the user scrolls or presses a key. `apply`
 * runs once per frame until the view reads back the target (`settled`) on two frames in a row: a
 * layout still being measured (estimated line heights of the editor, a preview still rendering)
 * moves the target after each apply, and a fixed number of frames is not enough on a busy machine.
 * It gives up after `maxFrames` when the target cannot be reached (the end of a short document).
 */
export function restoreWhileIdle(
  scroller: HTMLElement,
  apply: () => void,
  settled: () => boolean,
  maxFrames = RESTORE_MAX_FRAMES,
): () => void {
  let cancelled = false;
  let handle = 0;
  const stop = () => (cancelled = true);
  for (const name of INPUT_EVENTS)
    scroller.addEventListener(name, stop, { passive: true, once: true });
  const step = (remaining: number, stable: number) => {
    handle = requestAnimationFrame(() => {
      if (cancelled) return;
      apply();
      const next = settled() ? stable + 1 : 0;
      if (next < 2 && remaining > 1) step(remaining - 1, next);
    });
  };
  step(maxFrames, 0);
  return () => {
    cancelled = true;
    cancelAnimationFrame(handle);
    for (const name of INPUT_EVENTS) scroller.removeEventListener(name, stop);
  };
}
