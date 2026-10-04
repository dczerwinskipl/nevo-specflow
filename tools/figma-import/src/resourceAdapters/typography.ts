import { figmaProjectConfig } from '../../config';
import type { NestedTextIR } from '@nevo/figma-core/ir';
import {
  applyOpacity,
  applyPaint,
  bindPaintVariable,
  findLiveChild,
  mark,
  parseColor,
  px,
  removeWrongTypeSibling,
} from '../core/figmaNodes';
import type { DesignSystemIR, DesignResources } from '../core/model';
import { colorVariableFor } from '../features/documentResources';
import {
  applyTextFlowPresentation,
  applyTextPresentation,
  applyTextSizing,
} from '../features/textProjection';

export async function loadProjectFont(weight: string | undefined): Promise<FontName> {
  const family = figmaProjectConfig.figma.resources.fontFamily;
  const preferred: FontName = { family, style: px(weight) >= 600 ? 'Semi Bold' : 'Regular' };
  try {
    await figma.loadFontAsync(preferred);
    return preferred;
  } catch {
    const fallback: FontName = { family, style: 'Regular' };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

/** Materializes canonical text + ranges without reconstructing separators. */
export async function upsertSemanticText(
  parent: FrameNode | SlotNode | ComponentNode,
  richText: NestedTextIR,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  await removeWrongTypeSibling(parent, stableId, ['TEXT']);
  let node = await findLiveChild<TextNode>(parent, stableId, ['TEXT']);
  if (!node) {
    node = figma.createText();
    parent.appendChild(node);
  }
  const firstRun = richText.runs?.[0];
  const firstStyle = resources.textStyles.get(
    richText.textStyleRef ?? firstRun?.textStyleRef ?? '',
  );
  node.name = richText.text.length > 32 ? `${richText.text.slice(0, 29)}…` : richText.text;
  mark(node, stableId);
  const baseFont = firstStyle?.fontName ?? (await loadProjectFont(richText.style.fontWeight));
  await figma.loadFontAsync(baseFont);
  node.fontName = baseFont;
  node.characters = richText.text;
  if (firstStyle) await node.setTextStyleIdAsync(firstStyle.id);
  applyTextPresentation(node, richText.style);
  // Establish one deterministic full-node base before range overrides. This
  // gives separators the same metrics and semantic color as the first run.
  applyPaint(node, richText.style, 'color');
  const baseBinding = richText.colorRef ?? firstRun?.colorRef ?? richText.bindings?.content;
  const baseVariable = colorVariableFor(ir, resources, richText.style.color, baseBinding);
  if (baseVariable) bindPaintVariable(node, 'fills', baseVariable);
  applyTextSizing(node, parent, richText.style);
  applyOpacity(node, richText.style);
  for (const run of richText.runs ?? []) {
    const style = run.textStyleRef ? resources.textStyles.get(run.textStyleRef) : undefined;
    if (style) {
      await figma.loadFontAsync(style.fontName);
      node.setRangeFontName(run.start, run.end, style.fontName);
      await node.setRangeTextStyleIdAsync(run.start, run.end, style.id);
    }
    const variable = colorVariableFor(
      ir,
      resources,
      richText.style.color,
      run.colorRef ?? baseBinding,
    );
    if (variable) {
      const base = parseColor(
        ir.resources.colors.find((item) => item.stableId === run.colorRef)?.value,
      ) ??
        parseColor(richText.style.color) ?? { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
      node.setRangeFills(run.start, run.end, [
        figma.variables.setBoundVariableForPaint(base, 'color', variable),
      ]);
    }
  }
  // Restore whole-flow CSS without flattening the distinct metrics belonging
  // to the actor/action ranges.
  applyTextFlowPresentation(node, richText.style);
  return node;
}
