import type { NestedLayerIR } from '@nevo/figma-core/ir';

function safe(value: string) {
  return encodeURIComponent(value.trim().replace(/\s+/g, '-'));
}

export function semanticLayerKey(layer: NestedLayerIR): string | undefined {
  if ('identity' in layer && layer.identity?.key) return `key/${safe(layer.identity.key)}`;
  if ('identity' in layer && layer.identity?.layer) return `layer/${safe(layer.identity.layer)}`;
  if ('componentRef' in layer) return `component/${safe(layer.componentRef)}`;
  if (layer.kind === 'slot-ref') return `slot/${safe(layer.name)}`;
  if (layer.kind === 'text' && layer.runs?.length) return 'typography-flow';
  if (layer.kind === 'asset') return `asset/${safe(layer.assetRef)}`;
  return undefined;
}

/**
 * Semantic siblings retain their identity when an unrelated sibling is
 * inserted. Position is used only for anonymous DOM/text layers.
 */
export function nestedStableIds(parentStableId: string, layers: readonly NestedLayerIR[]) {
  const occurrences = new Map<string, number>();
  return layers.map((layer, index) => {
    const semantic = semanticLayerKey(layer);
    if (!semantic) {
      const kind = 'componentRef' in layer ? 'component' : layer.kind;
      return `${parentStableId}/child/anonymous-${index}/${kind}`;
    }
    const occurrence = occurrences.get(semantic) ?? 0;
    occurrences.set(semantic, occurrence + 1);
    return `${parentStableId}/child/${semantic}${occurrence ? `~${occurrence + 1}` : ''}`;
  });
}
