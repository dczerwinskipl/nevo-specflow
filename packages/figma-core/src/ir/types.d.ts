export type DesignValue = string | number | boolean;
export interface ColorTokenDefinition {
    stableId: string;
    name: string;
    cssVariable: string;
}
export interface DesignTokenBindingRule {
    property: string;
    values: Record<string, string>;
}
export interface DesignTokenBindings {
    background?: DesignTokenBindingRule;
    border?: DesignTokenBindingRule;
    content?: DesignTokenBindingRule;
}
//# sourceMappingURL=types.d.ts.map