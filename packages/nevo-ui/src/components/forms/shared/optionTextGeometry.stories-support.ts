/**
 * Measure text fragments as well as slots: layout boxes alone cannot detect text painting beyond
 * their bounds. Both dropdowns keep the full name, metadata and reason in reading order.
 */
export function assertStackedOptionText(option: HTMLElement, owner: 'select' | 'combobox') {
  const label = option.querySelector<HTMLElement>(
    owner === 'select' ? '[data-design-slot=label]' : '[data-combobox-item-part=label]',
  );
  const description = option.querySelector<HTMLElement>(`[data-${owner}-item-part="description"]`);
  const meta = option.querySelector<HTMLElement>(`[data-${owner}-item-part="meta"]`);
  if (!label || !description || !meta) {
    throw new Error('The narrow option must contain its description and metadata.');
  }

  for (const [name, slot] of [
    ['label', label],
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

  if (
    meta.getBoundingClientRect().top < label.getBoundingClientRect().bottom - 1 ||
    description.getBoundingClientRect().top < meta.getBoundingClientRect().bottom - 1
  ) {
    throw new Error(`${owner} must stack the name, metadata and reason in that order.`);
  }
}

/** The selected decoration must not consume a column or change the content's geometry. */
export function assertSelectionPreservesContent(
  selected: HTMLElement,
  unselected: HTMLElement,
  owner: 'select' | 'combobox',
) {
  const selector =
    owner === 'select' ? '[data-design-slot=label]' : '[data-combobox-item-part=label]';
  const label = selected.querySelector<HTMLElement>(selector)!;
  const other = unselected.querySelector<HTMLElement>(selector)!;
  const root = selected.getBoundingClientRect();
  const style = getComputedStyle(selected);
  if (Math.abs(parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) > 1) {
    throw new Error(`${owner} must not reserve an asymmetric gutter for selection.`);
  }

  const expected = root.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (
    Math.abs(label.getBoundingClientRect().width - expected) > 1 ||
    Math.abs(label.getBoundingClientRect().width - other.getBoundingClientRect().width) > 1
  ) {
    throw new Error(`${owner} selection must leave the full padded width for content.`);
  }

  if (getComputedStyle(selected).backgroundColor === getComputedStyle(unselected).backgroundColor) {
    throw new Error(`${owner} selection must have a distinct background.`);
  }

  const accent = selected.querySelector<HTMLElement>(
    owner === 'select' ? '[data-design-slot=indicator]' : '[data-selection-accent]',
  );
  if (!accent || getComputedStyle(accent).position !== 'absolute' || accent.querySelector('svg')) {
    throw new Error(`${owner} selection is a non-layout accent, never a check icon.`);
  }
}
