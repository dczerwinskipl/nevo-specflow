import { type InputHTMLAttributes } from 'react';
import '../shared/textControl.css';
export declare const textInputControlClassName = "text-input w-full font-sans text-body-md text-content-primary transition-colors placeholder:text-content-placeholder disabled:cursor-not-allowed h-control-height-default rounded-control border border-solid border-border-default bg-surface-control px-control-padding-default disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-content-muted disabled:opacity-60";
export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
}
export declare const TextInput: import("react").ForwardRefExoticComponent<TextInputProps & import("react").RefAttributes<HTMLInputElement>>;
//# sourceMappingURL=TextInput.d.ts.map