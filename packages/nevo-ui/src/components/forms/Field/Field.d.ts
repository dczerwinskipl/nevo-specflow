import { type AriaAttributes, type HTMLAttributes, type LabelHTMLAttributes } from 'react';
export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
    controlId?: string;
    disabled?: boolean;
    invalid?: boolean;
}
export declare const FieldLabel: import("react").ForwardRefExoticComponent<LabelHTMLAttributes<HTMLLabelElement> & import("react").RefAttributes<HTMLLabelElement>>;
export declare const FieldDescription: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & import("react").RefAttributes<HTMLParagraphElement>>;
export declare const FieldError: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & import("react").RefAttributes<HTMLParagraphElement>>;
export declare function useFieldControl({ ariaDescribedBy, ariaInvalid, ariaLabelledBy, disabled, id, }: {
    ariaDescribedBy?: string;
    ariaInvalid?: AriaAttributes['aria-invalid'];
    ariaLabelledBy?: string;
    disabled?: boolean;
    id?: string;
}): {
    ariaDescribedBy: string | undefined;
    ariaInvalid: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
    ariaLabelledBy: string | undefined;
    disabled: boolean;
    id: string | undefined;
    insideField: boolean;
};
export declare const Field: import("react").ForwardRefExoticComponent<FieldProps & import("react").RefAttributes<HTMLDivElement>> & {
    Label: import("react").ForwardRefExoticComponent<LabelHTMLAttributes<HTMLLabelElement> & import("react").RefAttributes<HTMLLabelElement>>;
    Description: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & import("react").RefAttributes<HTMLParagraphElement>>;
    Error: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & import("react").RefAttributes<HTMLParagraphElement>>;
};
//# sourceMappingURL=Field.d.ts.map