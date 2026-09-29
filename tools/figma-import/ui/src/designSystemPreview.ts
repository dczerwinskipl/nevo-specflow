import type { DesignSystemIR } from '@nevo/figma-core/ir';
import type { IRInspection, InspectionItemKind } from '../../messages';
import { detailsRow, element } from './dom';
import { actionBadge, inspectionItem, uniqueCaptures } from './previewShared';

function incomingAction(
  stableId: string,
  inspection: IRInspection | null,
  kinds: InspectionItemKind[],
) {
  if (!inspection) return null;
  const exists = kinds.every((kind) => inspectionItem(stableId, inspection, kind)?.exists);
  return actionBadge(exists ? 'update' : 'new');
}

export function renderDesignSystemPreview(
  parent: HTMLElement,
  ir: DesignSystemIR,
  inspection: IRInspection | null,
) {
  const definitions = new Map(ir.definitions.map((item) => [item.component, item]));
  for (const [name, captures] of Object.entries(ir.components)) {
    const variants = uniqueCaptures(captures);
    const group = detailsRow(
      name,
      `${variants.length} ${variants.length === 1 ? 'variant' : 'variants'}`,
      definitions.get(name)?.description,
    );
    const children = element('div', undefined, 'children');
    for (const variant of variants) {
      const properties =
        Object.entries(variant.properties)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' · ') || 'Default';
      const row = element('div', undefined, 'leaf');
      row.append(element('span', properties, 'node-name'));
      const status = incomingAction(variant.stableId, inspection, ['component']);
      if (status) row.append(status);
      children.append(row);
    }
    group.append(children);
    parent.append(group);
  }

  const resources = [
    {
      name: 'Color variables',
      items: ir.resources.colors,
      label: 'tokens',
      kinds: ['color'] as const,
    },
    {
      name: 'Text styles',
      items: ir.resources.textStyles,
      label: 'styles',
      kinds: ['text-style'] as const,
    },
    { name: 'Assets', items: ir.resources.assets, label: 'variants', kinds: ['asset'] as const },
  ];
  for (const resource of resources) {
    const group = detailsRow(resource.name, `${resource.items.length} ${resource.label}`);
    const children = element('div', undefined, 'children');
    for (const item of resource.items) {
      const row = element('div', undefined, 'leaf');
      row.append(element('span', 'name' in item ? item.name : item.stableId, 'node-name'));
      const status = incomingAction(item.stableId, inspection, [...resource.kinds]);
      if (status) row.append(status);
      children.append(row);
    }
    group.append(children);
    parent.append(group);
  }

  if (inspection?.deletions.length) {
    const group = detailsRow(
      'Removed from incoming Design System',
      `${inspection.deletions.length} delete`,
    );
    group.open = true;
    const children = element('div', undefined, 'children');
    for (const item of inspection.deletions) {
      const row = element('div', undefined, 'leaf');
      row.append(
        element('span', item.stableId, 'node-name'),
        element('span', item.kind.replace('-', ' '), 'resource-kind'),
        actionBadge('delete'),
      );
      children.append(row);
    }
    group.append(children);
    parent.prepend(group);
  }
}



