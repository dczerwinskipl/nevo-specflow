import { figmaProjectConfig } from '../../config';
import { bindPaintVariable, mark, parseColor, px } from '../core/figmaNodes';
import {
  DATA_KEY,
  RESOURCE_KIND_KEY,
  type AssetResourceIR,
  type DesignResources,
} from '../core/model';

export function assetMaterializationIntent(representation: AssetResourceIR['representation']) {
  switch (representation) {
    case 'svg':
      return {
        kind: 'svg' as const,
        preservesAppearance: true,
        usesMask: false,
        usesTintLayer: false,
      };
    case 'svg-mask':
      return {
        kind: 'svg-mask' as const,
        preservesAppearance: false,
        usesMask: true,
        usesTintLayer: true,
      };
  }
}

export function dispatchAssetRepresentation<T>(
  representation: AssetResourceIR['representation'],
  materializers: { svg: () => T; 'svg-mask': () => T },
) {
  switch (representation) {
    case 'svg':
      return materializers.svg();
    case 'svg-mask':
      return materializers['svg-mask']();
  }
}

function removePreviousArt(component: ComponentNode, asset: AssetResourceIR) {
  const managedIds = new Set([
    `${asset.stableId}/art`,
    `${asset.stableId}/glyph`,
    `${asset.stableId}/color`,
  ]);
  for (const child of [...component.children]) {
    if (managedIds.has(child.getPluginData(DATA_KEY))) child.remove();
  }
}

function materializeSvg(component: ComponentNode, asset: AssetResourceIR) {
  removePreviousArt(component, asset);
  const art = figma.createNodeFromSvg(asset.svg);
  art.name = 'art';
  mark(art, `${asset.stableId}/art`);
  component.appendChild(art);
  art.x = 0;
  art.y = 0;
  art.resizeWithoutConstraints(
    Math.max(px(asset.style.width, 16), 0.01),
    Math.max(px(asset.style.height, 16), 0.01),
  );
}

function materializeSvgMask(
  component: ComponentNode,
  asset: AssetResourceIR,
  colorVariable: Variable | undefined,
) {
  removePreviousArt(component, asset);
  const imported = figma.createNodeFromSvg(asset.svg);
  if (!imported.children.length) throw new Error(`SVG ${asset.stableId} contains no vector art`);
  const flattened = figma.flatten([...imported.children], imported);
  flattened.name = 'glyph';
  const targetWidth = px(asset.style.width, 16);
  const targetHeight = px(asset.style.height, 16);
  const sourceWidth = Math.max(imported.width, 1);
  const sourceHeight = Math.max(imported.height, 1);
  const bounds = {
    x: ((flattened.x - imported.x) * targetWidth) / sourceWidth,
    y: ((flattened.y - imported.y) * targetHeight) / sourceHeight,
    width: (flattened.width * targetWidth) / sourceWidth,
    height: (flattened.height * targetHeight) / sourceHeight,
  };
  component.appendChild(flattened);
  mark(flattened, `${asset.stableId}/glyph`);
  flattened.x = bounds.x;
  flattened.y = bounds.y;
  flattened.resizeWithoutConstraints(Math.max(bounds.width, 0.01), Math.max(bounds.height, 0.01));
  flattened.isMask = true;
  flattened.maskType = 'VECTOR';

  const colorLayer = figma.createRectangle();
  colorLayer.name = 'color';
  mark(colorLayer, `${asset.stableId}/color`);
  colorLayer.x = 0;
  colorLayer.y = 0;
  colorLayer.resizeWithoutConstraints(targetWidth, targetHeight);
  const defaultPaint = parseColor(asset.style.color);
  colorLayer.fills = defaultPaint ? [defaultPaint] : [];
  if (colorVariable) bindPaintVariable(colorLayer, 'fills', colorVariable);
  colorLayer.strokes = [];
  component.appendChild(colorLayer);
  component.insertChild(0, flattened);
  component.insertChild(1, colorLayer);
  imported.remove();
}

export function configureAsset(
  component: ComponentNode,
  asset: AssetResourceIR,
  resources: DesignResources,
) {
  const width = px(asset.style.width, 16);
  const height = px(asset.style.height, 16);
  component.name = asset.stableId;
  component.setPluginData(RESOURCE_KIND_KEY, 'asset');
  component.resizeWithoutConstraints(width, height);
  component.clipsContent = false;
  component.fills = [];
  component.strokes = [];
  component.opacity = px(asset.style.opacity, 1);

  dispatchAssetRepresentation(asset.representation, {
    svg: () => materializeSvg(component, asset),
    'svg-mask': () =>
      materializeSvgMask(
        component,
        asset,
        resources.colors.get(figmaProjectConfig.figma.resources.assetColorToken),
      ),
  });
}
