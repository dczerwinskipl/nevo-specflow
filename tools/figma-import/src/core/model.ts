import { figmaProjectConfig } from '../../config';
import type {
  AssetLayerIR,
  AssetResourceIR,
  FigmaComponentDefinition,
  ComponentCaptureIR,
  ComputedStyleRecord,
  DesignSystemIR,
  DesignValue,
  FigmaComponentGeometry,
  FigmaGeometryOverride,
  NestedComponentIR,
  NestedElementIR,
  NestedLayerIR,
  NestedSlotIR,
  NestedTextIR,
  ScreensIR,
  SlotIR,
  FigmaSlotDefinition,
  TextStyleResourceIR,
} from '@nevo/figma-core/ir';

export type {
  FigmaComponentDefinition,
  ComponentCaptureIR,
  ComputedStyleRecord as ComputedStyle,
  DesignSystemIR,
  DesignValue,
  FigmaComponentGeometry,
  FigmaGeometryOverride,
  AssetLayerIR,
  AssetResourceIR,
  NestedComponentIR,
  NestedElementIR,
  NestedLayerIR,
  NestedSlotIR,
  NestedTextIR,
  ScreensIR,
  SlotIR,
  FigmaSlotDefinition,
  TextStyleResourceIR,
};

export interface DesignResources {
  colors: ReadonlyMap<string, Variable>;
  textStyles: ReadonlyMap<string, TextStyle>;
  assets: ReadonlyMap<string, ComponentNode>;
}

export interface OverviewAxis {
  name: string;
  values: string[];
}

export interface OverviewVariant {
  component: ComponentNode;
  properties: Record<string, string>;
}

export interface OverviewModel {
  component: string;
  stableId: string;
  axes: OverviewAxis[];
  variants: OverviewVariant[];
}

export type RenderRootNode = ComponentNode | FrameNode;
export type AutoLayoutNode = ComponentNode | FrameNode | SlotNode | InstanceNode;

export const DATA_KEY = figmaProjectConfig.figma.pluginData.stableId;
export const MANAGED_KEY = figmaProjectConfig.figma.pluginData.managed;
export const DESIGN_SECTION_ID = figmaProjectConfig.figma.sections.designSystem.stableId;
export const OVERVIEWS_SECTION_ID = figmaProjectConfig.figma.sections.overviews.stableId;
export const SCREENS_SECTION_ID = figmaProjectConfig.figma.sections.screens.stableId;
export const COLOR_COLLECTION_ID = figmaProjectConfig.figma.variableCollection.stableId;
export const SLOT_SCHEMA_KEY = figmaProjectConfig.figma.pluginData.slotSchema;
export const RESOURCE_KIND_KEY = figmaProjectConfig.figma.pluginData.resourceKind;
export const SLOT_SCHEMA_VERSION = '3';
