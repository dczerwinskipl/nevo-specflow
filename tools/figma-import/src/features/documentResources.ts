import { parseColor, px } from '../core/figmaNodes';
import {
  COLOR_COLLECTION_ID,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  MANAGED_KEY,
  type ScreensIR,
} from '../core/model';
import { loadProjectFont } from '../resourceAdapters/typography';
import { resolveSemanticTokenId } from '../../tokenResolution';
import { figmaProjectConfig } from '../../config';
export async function upsertColorVariables(ir: DesignSystemIR) {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = collections.find((item) => item.getPluginData(DATA_KEY) === COLOR_COLLECTION_ID);
  if (!collection)
    collection = figma.variables.createVariableCollection(
      figmaProjectConfig.figma.variableCollection.name,
    );
  collection.name = figmaProjectConfig.figma.variableCollection.name;
  collection.setPluginData(DATA_KEY, COLOR_COLLECTION_ID);
  collection.setPluginData(MANAGED_KEY, 'true');

  const variables = await figma.variables.getLocalVariablesAsync('COLOR');
  const result = new Map<string, Variable>();
  for (const definition of ir.resources.colors) {
    let variable = variables.find((item) => item.getPluginData(DATA_KEY) === definition.stableId);
    if (!variable) {
      variable = figma.variables.createVariable(definition.name, collection, 'COLOR');
      variables.push(variable);
    }
    variable.name = definition.name;
    variable.setPluginData(DATA_KEY, definition.stableId);
    variable.setPluginData(MANAGED_KEY, 'true');
    const paint = parseColor(definition.value);
    variable.setValueForMode(collection.defaultModeId, {
      r: paint?.color.r ?? 0,
      g: paint?.color.g ?? 0,
      b: paint?.color.b ?? 0,
      a: paint?.opacity ?? 0,
    });
    result.set(definition.stableId, variable);
  }
  const expected = new Set(ir.resources.colors.map((definition) => definition.stableId));
  for (const variable of variables) {
    const stableId = variable.getPluginData(DATA_KEY);
    if (
      variable.variableCollectionId === collection.id &&
      variable.getPluginData(MANAGED_KEY) === 'true' &&
      stableId &&
      !expected.has(stableId)
    )
      variable.remove();
  }
  return result;
}

export async function upsertTextStyles(ir: DesignSystemIR) {
  const localStyles = await figma.getLocalTextStylesAsync();
  const result = new Map<string, TextStyle>();
  for (const definition of ir.resources.textStyles) {
    const source = definition.style;
    let style = localStyles.find((item) => item.getPluginData(DATA_KEY) === definition.stableId);
    if (!style) {
      style = figma.createTextStyle();
      localStyles.push(style);
    }
    style.name = `${figmaProjectConfig.figma.textStylePrefix}/${definition.name}`;
    style.setPluginData(DATA_KEY, definition.stableId);
    style.setPluginData(MANAGED_KEY, 'true');
    style.fontName = await loadProjectFont(source.fontWeight);
    style.fontSize = px(source.fontSize, 14);
    style.lineHeight =
      source.lineHeight === 'normal'
        ? { unit: 'AUTO' }
        : { unit: 'PIXELS', value: px(source.lineHeight, px(source.fontSize, 14)) };
    style.letterSpacing = { unit: 'PIXELS', value: px(source.letterSpacing) };
    style.textCase = source.textTransform === 'uppercase' ? 'UPPER' : 'ORIGINAL';
    result.set(definition.stableId, style);
  }
  const expected = new Set(ir.resources.textStyles.map((definition) => definition.stableId));
  for (const style of localStyles) {
    const stableId = style.getPluginData(DATA_KEY);
    if (style.getPluginData(MANAGED_KEY) === 'true' && stableId && !expected.has(stableId))
      style.remove();
  }
  return result;
}

export async function upsertDesignResources(ir: DesignSystemIR): Promise<DesignResources> {
  const [colors, textStyles] = await Promise.all([upsertColorVariables(ir), upsertTextStyles(ir)]);
  return { colors, textStyles, assets: new Map() };
}

export async function readDesignResources(ir: ScreensIR): Promise<DesignResources> {
  const [variables, textStyles] = await Promise.all([
    figma.variables.getLocalVariablesAsync('COLOR'),
    figma.getLocalTextStylesAsync(),
  ]);
  const colors = new Map<string, Variable>();
  const textStyleResources = new Map<string, TextStyle>();
  for (const definition of ir.resources.colors) {
    const variable = variables.find((item) => item.getPluginData(DATA_KEY) === definition.stableId);
    if (variable) colors.set(definition.stableId, variable);
  }
  for (const definition of ir.resources.textStyles) {
    const style = textStyles.find((item) => item.getPluginData(DATA_KEY) === definition.stableId);
    if (style) textStyleResources.set(definition.stableId, style);
  }
  const assets = new Map<string, ComponentNode>();
  for (const asset of ir.resources.assets) {
    const master = figma.currentPage.findOne(
      (node) => node.type === 'COMPONENT' && node.getPluginData(DATA_KEY) === asset.stableId,
    ) as ComponentNode | undefined;
    if (master) assets.set(asset.stableId, master);
  }
  if (
    colors.size !== ir.resources.colors.length ||
    textStyleResources.size !== ir.resources.textStyles.length ||
    assets.size !== ir.resources.assets.length
  ) {
    throw new Error(
      'Missing Design System Variables, Text Styles or Assets. Run Design System sync first.',
    );
  }
  return { colors, textStyles: textStyleResources, assets };
}

export function colorVariableFor(
  ir: DesignSystemIR,
  resources: DesignResources,
  color: string | undefined,
  preferredStableId?: string,
) {
  const preferred = preferredStableId ? resources.colors.get(preferredStableId) : undefined;
  if (preferred) return preferred;
  const direct = resolveSemanticTokenId(preferredStableId, color, ir.resources.colors);
  return direct ? resources.colors.get(direct) : undefined;
}



