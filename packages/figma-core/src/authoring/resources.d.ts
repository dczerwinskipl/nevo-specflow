import type { DesignValue } from '../ir/types';
import type { NoDesignValues, VariantAxes, VariantSelection } from './types';
export type ResourceKind = 'asset' | 'text-style';
declare const resourceRefBrand: unique symbol;
export type ResourceRef<Kind extends ResourceKind, Id extends string = string, Properties extends Record<string, DesignValue> = Record<string, DesignValue>> = string & {
    readonly [resourceRefBrand]: {
        kind: Kind;
        id: Id;
        properties: Properties;
    };
};
export type AssetRef<Id extends string = string, Properties extends Record<string, DesignValue> = Record<string, DesignValue>> = ResourceRef<'asset', Id, Properties>;
export type TextStyleRef<Id extends string = string, Properties extends Record<string, DesignValue> = Record<string, DesignValue>> = ResourceRef<'text-style', Id, Properties>;
export type ResourceSetRef<Id extends string = string> = `${Id}/set`;
export interface DesignResourceDefinition<Id extends string = string, Kind extends ResourceKind = ResourceKind, Axes extends VariantAxes = VariantAxes> {
    id: Id;
    kind: Kind;
    variants: Axes;
}
export type AnyResourceDefinition = DesignResourceDefinition<string, ResourceKind, VariantAxes>;
export type ResourceId<Definitions extends readonly AnyResourceDefinition[]> = Definitions[number]['id'];
type ResourceIdForKind<Definitions extends readonly AnyResourceDefinition[], Kind extends ResourceKind> = Extract<Definitions[number], {
    kind: Kind;
}>['id'];
type ResourceDefinitionFor<Definitions extends readonly AnyResourceDefinition[], Id extends ResourceId<Definitions>> = Extract<Definitions[number], {
    id: Id;
}>;
export type ResourceCaptureRegistry<Definitions extends readonly AnyResourceDefinition[]> = {
    [Definition in Definitions[number] as Definition['id']]: NoDesignValues;
};
export declare function defineDesignResource<const Id extends string, const Kind extends ResourceKind, const Axes extends VariantAxes>(definition: DesignResourceDefinition<Id, Kind, Axes>): DesignResourceDefinition<Id, Kind, Axes>;
export declare function defineResourceRegistry<const Definitions extends readonly AnyResourceDefinition[]>(...definitions: Definitions): Definitions;
export declare function createResourceAuthoring<const Definitions extends readonly AnyResourceDefinition[]>(definitions: Definitions): {
    assetRef<Id extends ResourceIdForKind<Definitions, "asset">, const Properties extends VariantSelection<ResourceDefinitionFor<Definitions, Id>["variants"]>>(id: Id, properties: Properties & Record<Exclude<keyof Properties, keyof VariantSelection<ResourceDefinitionFor<Definitions, Id>["variants"]>>, never>): AssetRef<Id, Properties>;
    textStyleRef<Id extends ResourceIdForKind<Definitions, "text-style">, const Properties extends VariantSelection<ResourceDefinitionFor<Definitions, Id>["variants"]>>(id: Id, properties: Properties & Record<Exclude<keyof Properties, keyof VariantSelection<ResourceDefinitionFor<Definitions, Id>["variants"]>>, never>): TextStyleRef<Id, Properties>;
    resourceSetRef<Id extends ResourceId<Definitions>>(id: Id): ResourceSetRef<Id>;
};
export {};
//# sourceMappingURL=resources.d.ts.map