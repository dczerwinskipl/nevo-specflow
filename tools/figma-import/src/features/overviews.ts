import { buildComponentImportPlan, buildOverviewLayout, resourceCatalogStableId } from '../../plan';
import { findStable, mark } from '../core/figmaNodes';
import { loadProjectFont } from '../resourceAdapters/typography';
import {
  type ComponentCaptureIR,
  type FigmaComponentDefinition,
  type DesignResources,
  type OverviewAxis,
  type OverviewModel,
  type OverviewVariant,
} from '../core/model';
import type { ResourceCatalogDefinition } from '@nevo/figma-core/authoring';
import { canonicalCaptures, componentDisplayName } from './componentLayout';
export function orderedKeys(preferred: readonly string[], actual: readonly string[]) {
  return [
    ...preferred.filter((key) => actual.includes(key)),
    ...actual.filter((key) => !preferred.includes(key)),
  ];
}

export function layoutSetMatrix(
  set: ComponentSetNode,
  name: string,
  x: number,
  y: number,
  preferredRows: readonly string[],
  preferredColumns: readonly string[],
  keyFor: (component: ComponentNode) => { row: string; column: string } | undefined,
  minimumCell: { width: number; height: number },
) {
  const items = set.children
    .filter((child): child is ComponentNode => child.type === 'COMPONENT')
    .map((component) => ({ component, key: keyFor(component) }))
    .filter((item): item is { component: ComponentNode; key: { row: string; column: string } } =>
      Boolean(item.key),
    );
  const rows = orderedKeys(preferredRows, [...new Set(items.map((item) => item.key.row))]);
  const columns = orderedKeys(preferredColumns, [...new Set(items.map((item) => item.key.column))]);
  const columnWidths = columns.map((column) =>
    Math.max(
      minimumCell.width,
      ...items.filter((item) => item.key.column === column).map((item) => item.component.width),
    ),
  );
  const rowHeights = rows.map((row) =>
    Math.max(
      minimumCell.height,
      ...items.filter((item) => item.key.row === row).map((item) => item.component.height),
    ),
  );
  const padding = 24;
  const columnGap = 24;
  const rowGap = 20;
  const xOffsets = columnWidths.map(
    (_, index) =>
      padding +
      columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0) +
      columnGap * index,
  );
  const yOffsets = rowHeights.map(
    (_, index) =>
      padding +
      rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0) +
      rowGap * index,
  );

  set.name = name;
  set.x = x;
  set.y = y;
  set.layoutMode = 'NONE';
  set.resizeWithoutConstraints(
    padding * 2 +
      columnWidths.reduce((sum, width) => sum + width, 0) +
      columnGap * Math.max(columns.length - 1, 0),
    padding * 2 +
      rowHeights.reduce((sum, height) => sum + height, 0) +
      rowGap * Math.max(rows.length - 1, 0),
  );
  set.fills = [{ type: 'SOLID', color: { r: 0.055, g: 0.061, b: 0.075 } }];
  set.cornerRadius = 12;
  for (const { component, key } of items) {
    const column = columns.indexOf(key.column);
    const row = rows.indexOf(key.row);
    if (column < 0 || row < 0) continue;
    component.x = xOffsets[column]! + (columnWidths[column]! - component.width) / 2;
    component.y = yOffsets[row]! + (rowHeights[row]! - component.height) / 2;
  }
}

export function humanize(value: string) {
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

export function axisCombinations(axes: OverviewAxis[]) {
  return axes.reduce<Record<string, string>[]>(
    (combinations, axis) =>
      combinations.flatMap((combination) =>
        axis.values.map((value) => ({ ...combination, [axis.name]: value })),
      ),
    [{}],
  );
}

export function matchesProperties(variant: OverviewVariant, values: Record<string, string>) {
  return Object.entries(values).every(([name, value]) => variant.properties[name] === value);
}

export function hasOverviewMatrixHeader(row?: OverviewAxis, column?: OverviewAxis) {
  return row !== undefined || column !== undefined;
}

export function overviewCellDimensions(variants: readonly OverviewVariant[]) {
  return {
    width: Math.max(132, ...variants.map((variant) => variant.component.width + 32)),
    height: Math.max(64, ...variants.map((variant) => variant.component.height + 24)),
  };
}

export function overviewText(
  value: string,
  font: FontName,
  size: number,
  color: RGB,
  weight: 'normal' | 'strong' = 'normal',
) {
  const node = figma.createText();
  node.fontName = font;
  node.characters = value;
  node.fontSize = size;
  node.textDecoration = 'NONE';
  node.textCase = 'ORIGINAL';
  node.textAlignHorizontal = 'LEFT';
  node.textAlignVertical = 'TOP';
  node.letterSpacing = { unit: 'PIXELS', value: 0 };
  node.lineHeight = { unit: 'AUTO' };
  node.fills = [{ type: 'SOLID', color, opacity: weight === 'strong' ? 1 : 0.78 }];
  node.textAutoResize = 'WIDTH_AND_HEIGHT';
  return node;
}

export function fixedLabelWidth(node: TextNode, width: number) {
  node.textAutoResize = 'HEIGHT';
  node.resizeWithoutConstraints(width, Math.max(node.height, 1));
}

/**
 * Reflow managed overview frames after every overview has reached its final
 * auto-layout height. Existing frames can otherwise retain positions derived
 * from transient heights while an update rebuilds their children.
 */
export function reflowOverviewStack(
  overviews: Pick<FrameNode, 'height' | 'x' | 'y'>[],
  startY = 24,
  gap = 48,
) {
  let nextY = startY;
  for (const overview of overviews) {
    overview.x = 24;
    overview.y = nextY;
    nextY += overview.height + gap;
  }
  return nextY;
}

export async function upsertOverview(
  section: SectionNode,
  model: OverviewModel,
  anchor: ComponentSetNode | ComponentNode,
  y: number,
) {
  const stableId = `${model.stableId}/overview`;
  let overview = findStable<FrameNode>(stableId, ['FRAME']);
  if (!overview) {
    overview = figma.createFrame();
    mark(overview, stableId);
    section.appendChild(overview);
  }
  if (overview.parent !== section) section.appendChild(overview);
  for (const child of [...overview.children]) child.remove();

  const regular = await loadProjectFont('400');
  const strong = await loadProjectFont('600');
  const foreground: RGB = { r: 0.945, g: 0.953, b: 0.961 };
  const muted: RGB = { r: 0.572, g: 0.608, b: 0.667 };
  const { column, row, groups } = buildOverviewLayout(model.axes);
  const groupCombinations = axisCombinations(groups);
  const columns = column?.values ?? ['default'];
  const rows = row?.values ?? ['default'];
  const { width: cellWidth, height: cellHeight } = overviewCellDimensions(model.variants);
  const rowLabelWidth = row ? 128 : 0;

  overview.name = `${model.component} — Overview`;
  overview.x = 24;
  overview.y = y;
  overview.layoutMode = 'VERTICAL';
  overview.primaryAxisSizingMode = 'AUTO';
  overview.counterAxisSizingMode = 'AUTO';
  overview.itemSpacing = 16;
  overview.paddingTop = 24;
  overview.paddingRight = 24;
  overview.paddingBottom = 24;
  overview.paddingLeft = 24;
  overview.cornerRadius = 12;
  overview.fills = [{ type: 'SOLID', color: { r: 0.071, g: 0.078, b: 0.094 } }];
  overview.strokes = [{ type: 'SOLID', color: { r: 0.145, g: 0.165, b: 0.2 } }];
  overview.strokeWeight = 1;
  overview.clipsContent = false;

  overview.appendChild(
    overviewText(`${model.component} — overview`, strong, 18, foreground, 'strong'),
  );
  const layoutSummary =
    [
      row ? `Rows: ${humanize(row.name)}` : undefined,
      column ? `Columns: ${humanize(column.name)}` : undefined,
      groups.length
        ? `Groups: ${groups.map((axis) => humanize(axis.name)).join(' / ')}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' · ') || 'Standalone component';
  anchor.descriptionMarkdown = `# ${model.component}\n\n${layoutSummary}.\n\nGenerated from canonical rendered captures.`;
  for (const variant of model.variants) {
    const details = Object.entries(variant.properties)
      .map(([name, value]) => `${humanize(name)}: ${humanize(value)}`)
      .join(' · ');
    variant.component.description = details || `${model.component} standalone component`;
  }
  overview.appendChild(overviewText(layoutSummary, regular, 11, muted));

  for (const groupValues of groupCombinations) {
    const group = figma.createFrame();
    group.name = groups.length
      ? groups
          .map((axis) => `${humanize(axis.name)}: ${humanize(groupValues[axis.name] ?? '')}`)
          .join(' · ')
      : 'Variants';
    group.layoutMode = 'VERTICAL';
    group.primaryAxisSizingMode = 'AUTO';
    group.counterAxisSizingMode = 'AUTO';
    group.itemSpacing = 10;
    group.fills = [];
    group.strokes = [];
    overview.appendChild(group);
    if (groups.length)
      group.appendChild(overviewText(group.name, strong, 12, foreground, 'strong'));

    if (hasOverviewMatrixHeader(row, column)) {
      const header = figma.createFrame();
      header.name = 'Column labels';
      header.layoutMode = 'HORIZONTAL';
      header.primaryAxisSizingMode = 'AUTO';
      header.counterAxisSizingMode = 'AUTO';
      header.itemSpacing = 8;
      header.fills = [];
      header.strokes = [];
      group.appendChild(header);
      if (row) {
        const corner = overviewText(humanize(row.name), strong, 10, muted, 'strong');
        fixedLabelWidth(corner, rowLabelWidth);
        header.appendChild(corner);
      }
      for (const value of columns) {
        const columnCell = figma.createFrame();
        columnCell.name = `${column ? humanize(column.name) : 'Variant'}: ${humanize(value)}`;
        columnCell.layoutMode = 'HORIZONTAL';
        columnCell.primaryAxisSizingMode = 'FIXED';
        columnCell.counterAxisSizingMode = 'AUTO';
        columnCell.primaryAxisAlignItems = 'CENTER';
        columnCell.counterAxisAlignItems = 'CENTER';
        columnCell.resizeWithoutConstraints(cellWidth, 18);
        columnCell.fills = [];
        columnCell.strokes = [];
        columnCell.appendChild(overviewText(humanize(value), strong, 10, muted, 'strong'));
        header.appendChild(columnCell);
      }
    }

    for (const rowValue of rows) {
      const rowFrame = figma.createFrame();
      rowFrame.name = row ? `${humanize(row.name)}: ${humanize(rowValue)}` : 'Variants';
      rowFrame.layoutMode = 'HORIZONTAL';
      rowFrame.primaryAxisSizingMode = 'AUTO';
      rowFrame.counterAxisSizingMode = 'AUTO';
      rowFrame.counterAxisAlignItems = 'CENTER';
      rowFrame.itemSpacing = 8;
      rowFrame.fills = [];
      rowFrame.strokes = [];
      group.appendChild(rowFrame);
      if (row) {
        const label = overviewText(humanize(rowValue), regular, 11, foreground);
        fixedLabelWidth(label, rowLabelWidth);
        rowFrame.appendChild(label);
      }
      for (const columnValue of columns) {
        const values = {
          ...groupValues,
          ...(row ? { [row.name]: rowValue } : {}),
          ...(column ? { [column.name]: columnValue } : {}),
        };
        const cell = figma.createFrame();
        cell.name = Object.entries(values)
          .map(([name, value]) => `${humanize(name)}=${humanize(value)}`)
          .join(', ');
        cell.layoutMode = 'HORIZONTAL';
        cell.primaryAxisSizingMode = 'FIXED';
        cell.counterAxisSizingMode = 'FIXED';
        cell.primaryAxisAlignItems = 'CENTER';
        cell.counterAxisAlignItems = 'CENTER';
        cell.resizeWithoutConstraints(cellWidth, cellHeight);
        cell.cornerRadius = 8;
        cell.fills = [{ type: 'SOLID', color: { r: 0.035, g: 0.039, b: 0.047 } }];
        cell.strokes = [];
        rowFrame.appendChild(cell);
        const variant = model.variants.find((candidate) => matchesProperties(candidate, values));
        if (variant) {
          const instance = variant.component.createInstance();
          instance.name = `${model.component} · ${cell.name}`;
          instance.layoutSizingHorizontal = 'FIXED';
          instance.layoutSizingVertical = 'FIXED';
          cell.appendChild(instance);
        }
      }
    }
  }
  return overview;
}

export function assetOverviewModel(
  catalog: ResourceCatalogDefinition,
  resources: DesignResources,
): OverviewModel {
  return {
    component: catalog.name,
    stableId: catalog.setStableId,
    axes: [
      { name: catalog.rowAxis.name, values: [...catalog.rowAxis.values] },
      { name: catalog.columnAxis.name, values: [...catalog.columnAxis.values] },
    ],
    variants: catalog.items.flatMap((item) => {
      const master = resources.assets.get(item.resourceRef);
      return master
        ? [
            {
              component: master,
              properties: {
                [catalog.columnAxis.name]: item.column,
                [catalog.rowAxis.name]: item.row,
              },
            },
          ]
        : [];
    }),
  };
}

export function textStyleOverviewModel(catalog: ResourceCatalogDefinition): OverviewModel {
  return {
    component: catalog.name,
    stableId: catalog.setStableId,
    axes: [
      { name: catalog.rowAxis.name, values: [...catalog.rowAxis.values] },
      { name: catalog.columnAxis.name, values: [...catalog.columnAxis.values] },
    ],
    variants: catalog.items.flatMap((item) => {
      const master = findStable<ComponentNode>(resourceCatalogStableId(item.resourceRef), [
        'COMPONENT',
      ]);
      return master
        ? [
            {
              component: master,
              properties: {
                [catalog.columnAxis.name]: item.column,
                [catalog.rowAxis.name]: item.row,
              },
            },
          ]
        : [];
    }),
  };
}

export function componentOverviewModel(
  spec: FigmaComponentDefinition,
  captures: ComponentCaptureIR[],
): OverviewModel {
  const source = [...canonicalCaptures(spec, captures).values()];
  const plan = buildComponentImportPlan(spec, source);
  return {
    component: componentDisplayName(spec),
    stableId: plan.setStableId,
    axes: plan.axes.map((axis) => ({ name: axis.name, values: axis.values })),
    variants: plan.variants.flatMap((variant) => {
      const master = findStable<ComponentNode>(variant.stableId, ['COMPONENT']);
      return master ? [{ component: master, properties: variant.properties }] : [];
    }),
  };
}
