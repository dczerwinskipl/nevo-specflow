export declare const actionVariantClasses: {
    readonly primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
    readonly secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
    readonly ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
    readonly destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
};
export declare const fastColorTransitionClassName = "transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none";
export type ActionVariant = keyof typeof actionVariantClasses;
//# sourceMappingURL=interactionRecipes.d.ts.map