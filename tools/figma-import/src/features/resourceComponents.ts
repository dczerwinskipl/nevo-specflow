import {
  bindPaintVariable,
  findStable,
  mark,
  removeStaleManagedChildren,
} from '../core/figmaNodes';
import {
  type FigmaComponentDefinition,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  type TextStyleResourceIR,
} from '../core/model';
import { colorVariableFor } from './documentResources';
import { figmaProjectConfig } from '../../config';
import {
  catalogItem,
  catalogVariantName,
  type ResourceCatalogDefinition,
  type ResourceCatalogItem,
} from '@nevo/figma-core/authoring';
import { layoutSetMatrix } from './overviews';
import { resourceCatalogStableId } from '../../plan';
export async function upsertAssetCatalog(
  section: SectionNode,
  resources: DesignResources,
  catalog: ResourceCatalogDefinition,
  y: number,
) {
  let set = findStable<ComponentSetNode>(catalog.setStableId, ['COMPONENT_SET']);
  const variantNames = new Map(
    catalog.items.map((item) => [item.resourceRef, catalogVariantName(catalog, item)]),
  );
  if (set) {
    set = await repairSetIfNeeded(
      set,
      section,
      catalog.setStableId,
      catalog.items.map((item) => item.resourceRef),
      undefined,
      (stableId) => variantNames.get(stableId),
    );
  }
  const masters: ComponentNode[] = [];
  for (const item of catalog.items) {
    const cached =
      resources.assets.get(item.resourceRef) ??
      findStable<ComponentNode>(item.resourceRef, ['COMPONENT']);
    const component =
      (await liveNodeById(cached, 'COMPONENT')) ??
      (await liveComponentByStableId(item.resourceRef));
    if (!component) continue;
    component.name = catalogVariantName(catalog, item);
    if (set && component.parent !== set) set.appendChild(component);
    masters.push(component);
  }
  const expected = new Set(masters.map((master) => master.getPluginData(DATA_KEY)));
  if (set) {
    for (const child of [...set.children]) {
      if (
        child.type === 'COMPONENT' &&
        child.getPluginData(DATA_KEY) &&
        !expected.has(child.getPluginData(DATA_KEY))
      )
        section.appendChild(child);
    }
  }
  if (!set) {
    if (!masters.length) throw new Error('Resource catalog contains no materialized assets');
    set = figma.combineAsVariants(masters, section);
    mark(set, catalog.setStableId);
  }
  set.description = `Columns: ${catalog.columnAxis.name}. Rows: ${catalog.rowAxis.name}.`;
  layoutSetMatrix(
    set,
    catalog.name,
    24,
    y,
    [...catalog.rowAxis.values],
    [...catalog.columnAxis.values],
    (component) => {
      const item = catalogItem(catalog, component.getPluginData(DATA_KEY));
      return item ? { row: item.row, column: item.column } : undefined;
    },
    { width: 52, height: 42 },
  );
  return set;
}

export function ensureComponentProperty(
  owner: ComponentSetNode | ComponentNode,
  displayName: string,
  type: 'BOOLEAN' | 'TEXT',
  defaultValue: boolean | string,
) {
  const existing = Object.entries(owner.componentPropertyDefinitions).find(
    ([name, definition]) => name.split('#')[0] === displayName && definition.type === type,
  );
  if (existing) return owner.editComponentProperty(existing[0], { defaultValue });
  return owner.addComponentProperty(displayName, type, defaultValue);
}

export function deleteSetProperties(
  set: ComponentSetNode,
  displayNames: readonly string[],
  type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP',
) {
  const matches = Object.entries(set.componentPropertyDefinitions)
    .filter(
      ([name, definition]) =>
        displayNames.includes(name.split('#')[0] ?? '') && definition.type === type,
    )
    .map(([name]) => name);
  for (const name of matches) set.deleteComponentProperty(name);
}

async function liveNodeById<T extends SceneNode>(node: T | undefined, type: T['type']) {
  if (!node) return undefined;
  try {
    const live = await figma.getNodeByIdAsync(node.id);
    return live?.type === type ? (live as T) : undefined;
  } catch {
    return undefined;
  }
}

async function liveComponentByStableId(stableId: string) {
  const candidate = findStable<ComponentNode>(stableId, ['COMPONENT']);
  return liveNodeById(candidate, 'COMPONENT');
}

function isInvalidatedNode(error: unknown) {
  return error instanceof Error && error.message.includes('Node not found');
}

async function nameLiveComponent(stableId: string, component: ComponentNode, name: string) {
  let candidate = component;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      candidate.name = name;
      return candidate;
    } catch (error) {
      if (!isInvalidatedNode(error) || attempt === 2) throw error;
      const reacquired = await liveComponentByStableId(stableId);
      if (!reacquired) throw error;
      candidate = reacquired;
    }
  }
  throw new Error(`Could not name live component ${stableId}`);
}

export async function repairSetIfNeeded(
  set: ComponentSetNode,
  section: SectionNode,
  stableId: string,
  expectedMasterStableIds: readonly string[],
  spec?: FigmaComponentDefinition,
  variantNameForStableId?: (stableId: string) => string | undefined,
) {
  const liveSet =
    (await liveNodeById(set, 'COMPONENT_SET')) ??
    (await liveNodeById(
      findStable<ComponentSetNode>(stableId, ['COMPONENT_SET']),
      'COMPONENT_SET',
    ));
  if (!liveSet) return undefined;
  try {
    void liveSet.componentPropertyDefinitions;
    return liveSet;
  } catch {
    // A corrupt set proxy may reject both componentPropertyDefinitions and
    // children. Reconstruct exclusively from caller-supplied stable main-component IDs.
    const masters = (
      await Promise.all(expectedMasterStableIds.map(liveComponentByStableId))
    ).filter((master): master is ComponentNode => Boolean(master));
    if (!masters.length) return undefined;
    for (const master of masters) section.appendChild(master);
    // Moving the last child auto-deletes a set and can invalidate every cached
    // child proxy, so reacquire all main components again before any write.
    const liveMasters = await Promise.all(
      expectedMasterStableIds.map(async (masterStableId) => ({
        stableId: masterStableId,
        master: await liveComponentByStableId(masterStableId),
      })),
    );
    if (liveMasters.some(({ master }) => !master)) {
      const missing = liveMasters.filter(({ master }) => !master).map(({ stableId: id }) => id);
      throw new Error(
        `Could not reacquire components ${missing.join(', ')} while repairing ${stableId}`,
      );
    }
    const namedMasters: ComponentNode[] = [];
    for (const { stableId: masterStableId, master } of liveMasters) {
      const parts = masterStableId.split('/').slice(1);
      const explicitName = variantNameForStableId?.(masterStableId);
      const name =
        explicitName ??
        (spec
          ? spec.variantProperties
              .map(
                (property, index) =>
                  `${property.charAt(0).toUpperCase()}${property.slice(1)}=${parts[index] ?? ''}`,
              )
              .join(', ')
          : undefined);
      namedMasters.push(
        name && master ? await nameLiveComponent(masterStableId, master, name) : master!,
      );
    }
    const repaired = figma.combineAsVariants(namedMasters, section);
    mark(repaired, stableId);
    return repaired;
  }
}

export async function configureTextStyleCatalogItem(
  component: ComponentNode,
  definition: TextStyleResourceIR,
  item: ResourceCatalogItem,
  catalog: ResourceCatalogDefinition,
  textStyle: TextStyle,
  colorVariable: Variable | undefined,
) {
  component.name = catalogVariantName(catalog, item);
  component.layoutMode = 'HORIZONTAL';
  component.primaryAxisSizingMode = 'AUTO';
  component.counterAxisSizingMode = 'AUTO';
  component.primaryAxisAlignItems = 'MIN';
  component.counterAxisAlignItems = 'CENTER';
  // Resource catalog spacing belongs to its host, not the sample itself.
  component.paddingTop = 0;
  component.paddingRight = 0;
  component.paddingBottom = 0;
  component.paddingLeft = 0;
  component.fills = [];
  component.strokes = [];

  const sampleId = `${definition.stableId}/sample`;
  let sample = component.children.find(
    (child): child is TextNode =>
      child.type === 'TEXT' && child.getPluginData(DATA_KEY) === sampleId,
  );
  if (!sample) {
    sample = figma.createText();
    component.appendChild(sample);
  }
  sample.componentPropertyReferences = {};
  sample.name = 'text';
  mark(sample, sampleId);
  sample.fontName = textStyle.fontName;
  sample.characters = item.sample ?? definition.name;
  sample.textAutoResize = 'WIDTH_AND_HEIGHT';
  await sample.setTextStyleIdAsync(textStyle.id);
  sample.fills = [];
  if (colorVariable) bindPaintVariable(sample, 'fills', colorVariable);
}

export async function upsertTextStyleCatalog(
  ir: DesignSystemIR,
  section: SectionNode,
  resources: DesignResources,
  y: number,
  catalog: ResourceCatalogDefinition,
) {
  let set = findStable<ComponentSetNode>(catalog.setStableId, ['COMPONENT_SET']);
  const variantNames = new Map(
    catalog.items.map((item) => [
      resourceCatalogStableId(item.resourceRef),
      catalogVariantName(catalog, item),
    ]),
  );
  if (set) {
    set = await repairSetIfNeeded(
      set,
      section,
      catalog.setStableId,
      catalog.items.map((item) => resourceCatalogStableId(item.resourceRef)),
      undefined,
      (stableId) => variantNames.get(stableId),
    );
  }
  const masters: ComponentNode[] = [];
  for (const item of catalog.items) {
    const definition = ir.resources.textStyles.find(
      (candidate) => candidate.stableId === item.resourceRef,
    );
    if (!definition) continue;
    const textStyle = resources.textStyles.get(item.resourceRef);
    if (!textStyle) throw new Error(`Missing Text Style ${item.resourceRef}`);
    const catalogId = resourceCatalogStableId(item.resourceRef);
    let component = await liveComponentByStableId(catalogId);
    if (!component) {
      component = figma.createComponent();
      mark(component, catalogId);
    }
    await configureTextStyleCatalogItem(
      component,
      definition,
      item,
      catalog,
      textStyle,
      colorVariableFor(
        ir,
        resources,
        undefined,
        figmaProjectConfig.figma.resources.textStyleColorToken,
      ),
    );
    if (set && component.parent !== set) set.appendChild(component);
    masters.push(component);
  }
  if (set)
    removeStaleManagedChildren(
      set,
      new Set(
        catalog.items
          .filter((item) =>
            ir.resources.textStyles.some((definition) => definition.stableId === item.resourceRef),
          )
          .map((item) => resourceCatalogStableId(item.resourceRef)),
      ),
      new Set(['COMPONENT']),
    );
  if (!set) {
    if (!masters.length) throw new Error('IR contains no materialized text style definitions');
    set = figma.combineAsVariants(masters, section);
    mark(set, catalog.setStableId);
  }
  const defaultText = catalog.items[0]?.sample ?? 'Text';
  const textProperty = ensureComponentProperty(set, 'Text', 'TEXT', defaultText);
  for (const component of set.children) {
    if (component.type !== 'COMPONENT') continue;
    const sample = component.children.find(
      (child): child is TextNode => child.type === 'TEXT' && child.name === 'text',
    );
    if (!sample) continue;
    sample.componentPropertyReferences = {};
    sample.characters = defaultText;
    sample.componentPropertyReferences = { characters: textProperty };
  }
  set.description = `Columns: ${catalog.columnAxis.name}. Rows: ${catalog.rowAxis.name}. Layers use shared local Text Styles.`;
  layoutSetMatrix(
    set,
    catalog.name,
    24,
    y,
    [...catalog.rowAxis.values],
    [...catalog.columnAxis.values],
    (component) => {
      const item = catalog.items.find(
        (candidate) =>
          resourceCatalogStableId(candidate.resourceRef) === component.getPluginData(DATA_KEY),
      );
      return item ? { row: item.row, column: item.column } : undefined;
    },
    { width: 360, height: 64 },
  );
  return set;
}
