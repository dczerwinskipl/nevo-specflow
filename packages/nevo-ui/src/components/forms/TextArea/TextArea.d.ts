import { type TextareaHTMLAttributes } from 'react';
import '../shared/textControl.css';
import './TextArea.css';
export declare const textAreaControlClassName = "text-area scrollbar-subtle w-full font-sans text-body-md text-content-primary transition-colors placeholder:text-content-placeholder disabled:cursor-not-allowed rounded-control border border-solid border-border-default bg-surface-control p-control-padding-default disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-content-muted disabled:opacity-60";
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    autoGrow?: boolean;
    maxRows?: number;
    minRows?: number;
}
export declare function autoGrowMetrics(scrollHeight: number, lineHeight: number, verticalChrome: number, minRows: number, maxRows: number): {
    height: number;
    overflowing: boolean;
};
export declare const TextArea: import("react").ForwardRefExoticComponent<TextAreaProps & import("react").RefAttributes<HTMLTextAreaElement>>;
/** Internal composition helper; intentionally omitted from the public forms barrel. */
export declare const EmbeddedTextArea: import("react").ForwardRefExoticComponent<TextAreaProps & import("react").RefAttributes<HTMLTextAreaElement>>;
//# sourceMappingURL=TextArea.d.ts.map