export declare const floatingSurfaceClassName = "z-50 overflow-hidden rounded-composite border border-border-default bg-surface-raised text-content-primary shadow-2xl outline-none";
export declare const floatingContentClassName = "z-50 overflow-hidden rounded-composite border border-border-default bg-surface-raised text-content-primary shadow-2xl outline-none min-w-48 p-1";
export declare const floatingItemDefaults: {
    readonly state: "default";
};
export declare const floatingItemVariants: import("tailwind-variants/lite").TVReturnType<{
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined, "relative flex min-h-control-height-compact w-full select-none items-center gap-2 rounded-control px-control-padding-compact py-1.5 text-left text-body-sm text-content-secondary outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-content-primary data-[design-prop-state=highlighted]:bg-surface-hover data-[design-prop-state=highlighted]:text-content-primary data-[disabled]:pointer-events-none data-[disabled]:text-content-muted data-[disabled]:opacity-50 transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none", {
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined>>;
export declare const floatingLabelClassName = "px-2 pb-2 pt-1 font-sans text-section-label uppercase text-content-muted";
export declare const floatingSeparatorClassName = "-mx-1 my-1 h-px bg-divider";
//# sourceMappingURL=floatingRecipes.d.ts.map