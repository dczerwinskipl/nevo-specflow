import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useMemo, useRef, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { EmbeddedTextArea } from '../../forms/TextArea/TextArea';
import './MessageComposer.css';
export const messageComposerDefaults = {
    state: 'default',
    presentation: 'standalone',
};
export const messageComposerVariants = tv({
    base: 'message-composer grid w-full min-w-0 overflow-hidden transition-colors',
    variants: {
        state: {
            default: '',
            disabled: 'opacity-60',
        },
        presentation: {
            standalone: 'rounded-composite border border-solid',
            integrated: 'rounded-none border-0 bg-transparent',
        },
    },
    compoundVariants: [
        {
            state: 'default',
            presentation: 'standalone',
            class: 'border-border-default bg-surface-raised',
        },
        {
            state: 'disabled',
            presentation: 'standalone',
            class: 'border-border-subtle bg-surface-subtle',
        },
    ],
    defaultVariants: messageComposerDefaults,
});
const MessageComposerContext = createContext(null);
function useMessageComposerContext(part) {
    const context = useContext(MessageComposerContext);
    if (!context)
        throw new Error(`${part} must be rendered inside MessageComposer.`);
    return context;
}
export function resolveMessageComposerKeyAction({ enterKeyBehavior, isComposing, key, shiftKey, }) {
    if (key !== 'Enter')
        return 'none';
    if (isComposing || shiftKey || enterKeyBehavior === 'newline')
        return 'newline';
    return 'submit';
}
const MessageComposerRoot = forwardRef(function MessageComposerRoot({ children, className, disabled = false, enterKeyBehavior = 'submit', onSubmit, presentation = messageComposerDefaults.presentation, readOnly = false, ...props }, ref) {
    const formRef = useRef(null);
    const editorRef = useRef(null);
    useImperativeHandle(ref, () => formRef.current, []);
    const state = disabled ? 'disabled' : 'default';
    const capture = useDesignMetadata('MessageComposer', {
        presentation,
        state,
    });
    const registerEditor = useCallback((node) => {
        editorRef.current = node;
    }, []);
    const requestSubmit = useCallback(() => {
        if (disabled || readOnly)
            return;
        formRef.current?.requestSubmit();
    }, [disabled, readOnly]);
    const context = useMemo(() => ({
        disabled,
        enterKeyBehavior,
        readOnly,
        registerEditor,
        requestSubmit,
    }), [disabled, enterKeyBehavior, readOnly, registerEditor, requestSubmit]);
    const handleSubmit = (event) => {
        event.preventDefault();
        if (disabled || readOnly)
            return;
        void onSubmit(editorRef.current?.value ?? '', event);
    };
    return (_jsx(MessageComposerContext.Provider, { value: context, children: _jsx("form", { ref: formRef, className: cn(messageComposerVariants({
                presentation,
                state,
            }), className), "data-disabled": disabled || undefined, "data-presentation": presentation, "data-readonly": readOnly || undefined, onSubmit: handleSubmit, ...props, ...capture, children: _jsx("fieldset", { className: "contents", disabled: disabled, children: children }) }) }));
});
export const MessageComposerEditor = forwardRef(function MessageComposerEditor({ className, disabled, maxRows = 8, minRows = 1, onKeyDown, readOnly, ...props }, ref) {
    const composer = useMessageComposerContext('MessageComposer.Editor');
    const setEditorRef = useCallback((node) => {
        composer.registerEditor(node);
        if (typeof ref === 'function')
            ref(node);
        else if (ref)
            ref.current = node;
    }, [composer, ref]);
    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented)
            return;
        const nativeEvent = event.nativeEvent;
        const action = resolveMessageComposerKeyAction({
            enterKeyBehavior: composer.enterKeyBehavior,
            isComposing: nativeEvent.isComposing || Reflect.get(nativeEvent, 'keyCode') === 229,
            key: event.key,
            shiftKey: event.shiftKey,
        });
        if (action !== 'submit')
            return;
        event.preventDefault();
        composer.requestSubmit();
    };
    return (_jsx(EmbeddedTextArea, { ref: setEditorRef, autoGrow: true, className: className, disabled: composer.disabled || disabled, maxRows: maxRows, minRows: minRows, onKeyDown: handleKeyDown, readOnly: composer.readOnly || readOnly, ...props, ...designSlot('MessageComposer', 'editor') }));
});
export const MessageComposerToolbar = forwardRef(function MessageComposerToolbar({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('message-composer-toolbar flex min-w-0 items-center justify-between gap-2 border-t border-divider px-2 py-1.5', className), ...props, ...designSlot('MessageComposer', 'toolbar') }));
});
export const MessageComposer = Object.assign(MessageComposerRoot, {
    Editor: MessageComposerEditor,
    Toolbar: MessageComposerToolbar,
});
//# sourceMappingURL=MessageComposer.js.map