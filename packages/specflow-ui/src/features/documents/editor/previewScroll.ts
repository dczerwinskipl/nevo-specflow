import {
  anchorFromBlocks,
  blockForLine,
  clamp01,
  clampAnchor,
  ratioOf,
  type MappedBlock,
  type ScrollAnchor,
} from './documentScrollAnchor';

/** Rendered blocks carrying `data-source-line` (`MarkdownDocument sourceLines`), measured now. */
export function readPreviewBlocks(scroller: HTMLElement, lineCount: number): MappedBlock[] {
  const origin = scroller.getBoundingClientRect().top;
  const elements = [...scroller.querySelectorAll<HTMLElement>('[data-source-line]')];
  return elements.map((element, index) => {
    const line = Number(element.dataset.sourceLine);
    let next: HTMLElement | undefined;
    for (let i = index + 1; i < elements.length; i++)
      if (!element.contains(elements[i]!)) {
        next = elements[i];
        break;
      }
    const rect = element.getBoundingClientRect();
    return {
      line,
      top: rect.top - origin,
      height: rect.height,
      span: Math.max(1, (next ? Number(next.dataset.sourceLine) : lineCount + 1) - line),
    };
  });
}

export function readPreviewAnchor(scroller: HTMLElement, lineCount: number) {
  const ratio = ratioOf(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
  return anchorFromBlocks(readPreviewBlocks(scroller, lineCount), ratio) ?? { offset: 0, ratio };
}

/** Scrolls the preview so the anchored source line sits at the top edge (ratio when unmapped). */
export function applyPreviewAnchor(scroller: HTMLElement, raw: ScrollAnchor, lineCount: number) {
  const anchor = clampAnchor(raw, lineCount);
  const blocks = anchor.line === undefined ? [] : readPreviewBlocks(scroller, lineCount);
  const target =
    anchor.line === undefined ? undefined : blockForLine(blocks, anchor.line, anchor.offset);
  if (!target) {
    scroller.scrollTop = clamp01(anchor.ratio) * (scroller.scrollHeight - scroller.clientHeight);
    return;
  }
  // The document top (padding above the first block) is the top of the view, not the block.
  if (target.block === blocks[0] && target.through === 0) scroller.scrollTop = 0;
  else scroller.scrollTop += target.block.top + target.through * target.block.height;
}
