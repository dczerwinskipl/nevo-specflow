import type { ColorTokenDefinition, DesignTokenBindings, DesignValue } from './types';

export type { ColorTokenDefinition, DesignValue } from './types';
export type ComputedStyleRecord = Record<string, string>;

export type SemanticTokenBindings = Partial<Record<keyof DesignTokenBindings, string>>;

export interface LayerIdentityIR {
  /** Explicit neutral author key, preferred over inferred identity. */
  key?: string;
  /** Semantic layer name from data-design-layer. */
  layer?: string;
}

export interface FigmaGeometryOverride {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  gap?: number;
}

export interface FigmaComponentGeometry {
  root?: FigmaGeometryOverride;
  slots?: Record<string, FigmaGeometryOverride>;
}

export interface ColorTokenIR extends Omit<ColorTokenDefinition, 'cssVariable'> {
  value: string;
}

export interface TextStylePropertiesIR {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
}

export interface AssetStyleIR {
  width: string;
  height: string;
  opacity: string;
  color: string;
}

export interface TextStyleResourceIR {
  kind: 'text-style';
  stableId: string;
  name: string;
  style: TextStylePropertiesIR;
}

export interface AssetResourceIR {
  kind: 'asset';
  stableId: string;
  svg: string;
  representation: 'svg' | 'svg-mask';
  style: AssetStyleIR;
}

export type FigmaSlotDefinition =
  | { kind: 'text'; propertyName: string; defaultText: string; required?: boolean }
  | {
      kind: 'asset-swap';
      propertyName: string;
      required?: boolean;
      defaultAssetRefs: Record<string, string>;
      variantProperty: string;
    }
  | { kind: 'container'; required?: boolean; exposeVisibility?: boolean }
  | { kind: 'slot'; propertyName: string; required?: boolean };

export interface TokenBindingRule {
  property: string;
  values: Record<string, string>;
}

export interface FigmaComponentDefinition<
  Properties extends Record<string, DesignValue> = Record<string, DesignValue>,
> {
  component: string;
  /** Human-facing Figma name. `component` remains the persisted IR identity. */
  displayName?: string;
  description?: string;
  target?: 'component' | 'fragment' | 'screen';
  order: number;
  variantProperties: Array<keyof Properties & string>;
  propertyValues: Partial<Record<keyof Properties & string, readonly DesignValue[]>>;
  defaultProperties?: Partial<Record<keyof Properties & string, DesignValue>>;
  slots: Record<string, FigmaSlotDefinition>;
  bindings?: {
    background?: TokenBindingRule;
    border?: TokenBindingRule;
    content?: TokenBindingRule;
  };
  figma?: FigmaComponentGeometry & {
    variants?: Record<string, FigmaComponentGeometry>;
  };
}

export interface NestedComponentIR {
  componentRef: string;
  identity?: LayerIdentityIR;
  properties: Record<string, DesignValue>;
  slots: Record<string, string | NestedSlotIR>;
  /** Computed presentation of the concrete public text slot at this use site. */
  textSlotStyles?: Record<string, ComputedStyleRecord>;
  style?: ComputedStyleRecord;
  bindings?: SemanticTokenBindings;
}

export interface NestedElementIR {
  kind: 'element';
  name: string;
  identity?: LayerIdentityIR;
  style: ComputedStyleRecord;
  bindings?: SemanticTokenBindings;
  children: NestedLayerIR[];
}

export interface NestedTextIR {
  kind: 'text';
  text: string;
  identity?: LayerIdentityIR;
  style: ComputedStyleRecord;
  bindings?: SemanticTokenBindings;
  textStyleRef?: string;
  colorRef?: string;
  runs?: TextRunIR[];
}

export interface TextRunIR {
  start: number;
  end: number;
  textStyleRef?: string;
  colorRef?: string;
}

export interface AssetLayerIR {
  kind: 'asset';
  assetRef: string;
  identity?: LayerIdentityIR;
  style: ComputedStyleRecord;
  colorRef?: string;
}

export interface NestedSlotReferenceIR {
  kind: 'slot-ref';
  name: string;
}

export type NestedLayerIR =
  NestedComponentIR | NestedElementIR | NestedTextIR | AssetLayerIR | NestedSlotReferenceIR;

export interface NestedSlotIR {
  kind: 'slot' | 'container' | 'asset-swap';
  children: NestedLayerIR[];
  bindings?: SemanticTokenBindings;
}

export type SlotIR =
  | {
      kind: 'text';
      text: string;
      textStyleRef?: string;
      colorRef?: string;
      style: ComputedStyleRecord;
      bindings?: SemanticTokenBindings;
    }
  | {
      kind: 'asset-swap';
      asset: AssetLayerIR;
      style: ComputedStyleRecord;
      bindings?: SemanticTokenBindings;
    }
  | {
      kind: 'container';
      style: ComputedStyleRecord;
      children: NestedLayerIR[];
      bindings?: SemanticTokenBindings;
    }
  | {
      kind: 'slot';
      style: ComputedStyleRecord;
      children: NestedLayerIR[];
      bindings?: SemanticTokenBindings;
    };

export interface ComponentCaptureIR {
  stableId: string;
  sourceId: string;
  /** Explicit author choice when more than one story shares a variant ID. */
  canonical?: boolean;
  component: string;
  properties: Record<string, DesignValue>;
  root: ComputedStyleRecord;
  bindings: SemanticTokenBindings;
  slots: Record<string, SlotIR | undefined>;
  structure?: NestedLayerIR[];
}

export interface DesignSystemIR {
  kind: 'design-system';
  schemaVersion: 4;
  generatedAt: string;
  source: {
    name: string;
    reference: string;
    route: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };
  semantics: {
    componentIdentityAttribute: 'data-design-component';
    slotAttribute: 'data-design-slot';
    note: string;
  };
  definitions: FigmaComponentDefinition[];
  resources: {
    colors: ColorTokenIR[];
    textStyles: TextStyleResourceIR[];
    assets: AssetResourceIR[];
  };
  diagnostics?: ProjectionDiagnosticIR[];
  components: Record<string, ComponentCaptureIR[]>;
}

export interface ScreensIR {
  kind: 'screens';
  schemaVersion: 3;
  generatedAt: string;
  source: DesignSystemIR['source'];
  semantics: DesignSystemIR['semantics'];
  definitions: FigmaComponentDefinition[];
  resources: DesignSystemIR['resources'];
  diagnostics?: ProjectionDiagnosticIR[];
  screens: Record<string, ComponentCaptureIR[]>;
}

export interface ProjectionDiagnosticIR {
  code:
    | 'unsupported-grid'
    | 'non-uniform-spacing'
    | 'unsupported-effect'
    | 'unsupported-transform'
    | 'unsupported-fixed-position'
    | 'unsupported-sticky-position'
    | 'unsupported-stacking-context'
    | 'unsupported-containing-block'
    | 'unsupported-background-image'
    | 'unsupported-border-style'
    | 'unsupported-outline';
  severity: 'warning';
  message: string;
  component?: string;
  layer?: string;
}

