import { findStable, mark } from '../core/figmaNodes';
import {
  DATA_KEY,
  MANAGED_KEY,
  RESOURCE_KIND_KEY,
  type AssetResourceIR,
  type DesignSystemIR,
  type DesignResources,
} from '../core/model';
import { configureAsset } from '../resourceAdapters/asset';

export function assetMainComponentFor(
  assetRef: string,
  resources: Pick<DesignResources, 'assets'>,
) {
  const mainComponent = resources.assets.get(assetRef);
  if (!mainComponent) throw new Error(`Missing asset main component ${assetRef}`);
  return mainComponent;
}

/**
 * Creates the reusable main components required by asset layers and public
 * instance-swap slots. Catalogue grouping is deliberately handled elsewhere.
 */
async function liveAsset(stableId: string) {
  const candidate = findStable<ComponentNode>(stableId, ['COMPONENT']);
  if (!candidate) return undefined;
  try {
    const live = await figma.getNodeByIdAsync(candidate.id);
    return live?.type === 'COMPONENT' ? live : undefined;
  } catch {
    return undefined;
  }
}

export async function upsertAssetResources(
  ir: DesignSystemIR,
  section: SectionNode,
  resources: DesignResources,
) {
  const assets = new Map<string, ComponentNode>();
  for (const [index, asset] of ir.resources.assets.entries()) {
    let component = await liveAsset(asset.stableId);
    if (!component) {
      component = figma.createComponent();
      mark(component, asset.stableId);
      section.appendChild(component);
    }
    configureAsset(component, asset, resources);
    if (component.parent?.type === 'PAGE') section.appendChild(component);
    if (component.parent === section) {
      component.x = 24 + index * 40;
      component.y = 24;
    }
    assets.set(asset.stableId, component);
  }

  const expected = new Set(ir.resources.assets.map((asset) => asset.stableId));
  for (const node of figma.currentPage.findAll(
    (candidate) =>
      candidate.type === 'COMPONENT' &&
      candidate.getPluginData(MANAGED_KEY) === 'true' &&
      candidate.getPluginData(RESOURCE_KIND_KEY) === 'asset',
  )) {
    const stableId = node.getPluginData(DATA_KEY);
    if (stableId && !expected.has(stableId)) node.remove();
  }
  return assets;
}

export async function existingAssetResources(definitions: readonly AssetResourceIR[]) {
  const entries = await Promise.all(
    definitions.map(async (asset) => {
      const mainComponent = await liveAsset(asset.stableId);
      return mainComponent ? ([asset.stableId, mainComponent] as const) : undefined;
    }),
  );
  return new Map(
    entries.filter((entry): entry is readonly [string, ComponentNode] => Boolean(entry)),
  );
}
