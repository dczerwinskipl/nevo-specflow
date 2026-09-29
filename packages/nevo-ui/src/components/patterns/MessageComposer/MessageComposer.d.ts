import { type FormHTMLAttributes, type HTMLAttributes, type SyntheticEvent } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
import { type TextAreaProps } from '../../forms/TextArea/TextArea';
import './MessageComposer.css';
export type MessageComposerEnterKeyBehavior = 'submit' | 'newline';
export type MessageComposerFormEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;
export declare const messageComposerDefaults: {
    readonly state: "default";
    readonly presentation: "standalone";
};
export declare const messageComposerVariants: import("tailwind-variants/lite").TVReturnType<{
    state: {
        default: "";
        disabled: "opacity-60";
    };
    presentation: {
        standalone: "rounded-composite border border-solid";
        integrated: "rounded-none border-0 bg-transparent";
    };
}, undefined, "message-composer grid w-full min-w-0 overflow-hidden transition-colors", {
    state: {
        default: "";
        disabled: "opacity-60";
    };
    presentation: {
        standalone: "rounded-composite border border-solid";
        integrated: "rounded-none border-0 bg-transparent";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    state: {
        default: "";
        disabled: "opacity-60";
    };
    presentation: {
        standalone: "rounded-composite border border-solid";
        integrated: "rounded-none border-0 bg-transparent";
    };
}, undefined>>;
export type MessageComposerPresentation = NonNullable<VariantProps<typeof messageComposerVariants>['presentation']>;
/** Standalone native form submission surface. Must not be nested inside another HTML form. */
export interface MessageComposerProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
    disabled?: boolean;
    enterKeyBehavior?: MessageComposerEnterKeyBehavior;
    onSubmit: (value: string, event: MessageComposerFormEvent) => void | Promise<void>;
    presentation?: MessageComposerPresentation;
    readOnly?: boolean;
}
export declare function resolveMessageComposerKeyAction({ enterKeyBehavior, isComposing, key, shiftKey, }: {
    enterKeyBehavior: MessageComposerEnterKeyBehavior;
    isComposing: boolean;
    key: string;
    shiftKey: boolean;
}): 'none' | 'submit' | 'newline';
export interface MessageComposerEditorProps extends Omit<TextAreaProps, 'autoGrow'> {
}
export declare const MessageComposerEditor: import("react").ForwardRefExoticComponent<MessageComposerEditorProps & import("react").RefAttributes<HTMLTextAreaElement>>;
export type MessageComposerToolbarProps = HTMLAttributes<HTMLDivElement>;
export declare const MessageComposerToolbar: import("react").ForwardRefExoticComponent<MessageComposerToolbarProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const MessageComposer: import("react").ForwardRefExoticComponent<MessageComposerProps & import("react").RefAttributes<HTMLFormElement>> & {
    Editor: import("react").ForwardRefExoticComponent<MessageComposerEditorProps & import("react").RefAttributes<HTMLTextAreaElement>>;
    Toolbar: import("react").ForwardRefExoticComponent<MessageComposerToolbarProps & import("react").RefAttributes<HTMLDivElement>>;
};
//# sourceMappingURL=MessageComposer.d.ts.map