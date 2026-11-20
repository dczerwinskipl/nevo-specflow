/**
 * Flex slots can have correct boxes while their text paints into the next column. Measure each
 * text node's line fragments, so these contracts catch that failure in both picker owners.
 */
export function assertSeparatedOptionText(option: HTMLElement, owner: 'select' | 'combobox') {
  const description = option.querySelector<HTMLElement>(`[data-${owner}-item-part="description"]`);
  const meta = option.querySelector<HTMLElement>(`[data-${owner}-item-part="meta"]`);
  if (!description || !meta) {
    throw new Error('The narrow option must contain its description and metadata.');
  }

  for (const [name, slot] of [
    ['description', description],
    ['metadata', meta],
  ] as const) {
    const bounds = slot.getBoundingClientRect();
    const textNodes = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
    let fragments = 0;
    while (textNodes.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(textNodes.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }

        fragments += 1;
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
          throw new Error(
            `${owner} ${name} text paints outside its slot: ${rect.left}–${rect.right}, slot ${bounds.left}–${bounds.right}.`,
          );
        }
      }
    }

    if (fragments === 0) {
      throw new Error(`${owner} ${name} must expose visible text fragments.`);
    }
  }

  if (meta.getBoundingClientRect().left - description.getBoundingClientRect().right < 4) {
    throw new Error(`${owner} description and metadata must keep a visible column gap.`);
  }
}
