export declare const iconNames: readonly ["search", "plus", "arrow-right", "trash", "close", "loader", "file", "branch", "chevron-right", "chevron-down", "check", "inbox", "folder", "archive", "database", "calendar", "clock", "eye", "eye-off", "menu", "ellipsis", "chat", "minimize", "open-full", "info", "circle-check", "triangle-alert", "circle-alert", "users", "workflow", "list-checks", "settings"];
export declare const iconSizes: readonly ["sm", "md"];
export declare const typographyVariantNames: readonly ["title-lg", "title-md", "title-sm", "body-lg", "body-md", "body-sm", "label-md", "label-sm", "section-label", "code-md"];
export type IconName = (typeof iconNames)[number];
export type IconSize = (typeof iconSizes)[number];
export type TypographyVariant = (typeof typographyVariantNames)[number];
export type IconAssetRef = `Icon/${IconName}/${IconSize}`;
export type TypographyTextStyleRef = `Typography/${TypographyVariant}`;
export declare function iconAssetRef(name: IconName, size: IconSize): IconAssetRef;
export declare function typographyTextStyleRef(variant: TypographyVariant): TypographyTextStyleRef;
//# sourceMappingURL=resources.d.ts.map