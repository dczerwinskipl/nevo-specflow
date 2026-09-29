import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { EmbeddedTextArea, type TextAreaProps } from '../../forms/TextArea/TextArea';
import './MessageComposer.css';

export type MessageComposerEnterKeyBehavior = 'submit' | 'newline';
export type MessageComposerFormEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;

export const messageComposerDefaults = {
  state: 'default',
  presentation: 'standalone',
} as const;

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

export type MessageComposerPresentation = NonNullable<
  VariantProps<typeof messageComposerVariants>['presentation']
>;

/** Standalone native form submission surface. Must not be nested inside another HTML form. */
export interface MessageComposerProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  disabled?: boolean;
  enterKeyBehavior?: MessageComposerEnterKeyBehavior;
  onSubmit: (value: string, event: MessageComposerFormEvent) => void | Promise<void>;
  presentation?: MessageComposerPresentation;
  readOnly?: boolean;
}

interface MessageComposerContextValue {
  disabled: boolean;
  enterKeyBehavior: MessageComposerEnterKeyBehavior;
  readOnly: boolean;
  registerEditor: (node: HTMLTextAreaElement | null) => void;
  requestSubmit: () => void;
}

const MessageComposerContext = createContext<MessageComposerContextValue | null>(null);

function useMessageComposerContext(part: string) {
  const context = useContext(MessageComposerContext);
  if (!context) throw new Error(`${part} must be rendered inside MessageComposer.`);
  return context;
}

export function resolveMessageComposerKeyAction({
  enterKeyBehavior,
  isComposing,
  key,
  shiftKey,
}: {
  enterKeyBehavior: MessageComposerEnterKeyBehavior;
  isComposing: boolean;
  key: string;
  shiftKey: boolean;
}): 'none' | 'submit' | 'newline' {
  if (key !== 'Enter') return 'none';
  if (isComposing || shiftKey || enterKeyBehavior === 'newline') return 'newline';
  return 'submit';
}

const MessageComposerRoot = forwardRef<HTMLFormElement, MessageComposerProps>(
  function MessageComposerRoot(
    {
      children,
      className,
      disabled = false,
      enterKeyBehavior = 'submit',
      onSubmit,
      presentation = messageComposerDefaults.presentation,
      readOnly = false,
      ...props
    },
    ref,
  ) {
    const formRef = useRef<HTMLFormElement>(null);
    const editorRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => formRef.current!, []);
    const state = disabled ? 'disabled' : 'default';
    const capture = useDesignMetadata('MessageComposer', {
      presentation,
      state,
    });

    const registerEditor = useCallback((node: HTMLTextAreaElement | null) => {
      editorRef.current = node;
    }, []);
    const requestSubmit = useCallback(() => {
      if (disabled || readOnly) return;
      formRef.current?.requestSubmit();
    }, [disabled, readOnly]);
    const context = useMemo(
      () => ({
        disabled,
        enterKeyBehavior,
        readOnly,
        registerEditor,
        requestSubmit,
      }),
      [disabled, enterKeyBehavior, readOnly, registerEditor, requestSubmit],
    );

    const handleSubmit: NonNullable<FormHTMLAttributes<HTMLFormElement>['onSubmit']> = (event) => {
      event.preventDefault();
      if (disabled || readOnly) return;
      void onSubmit(editorRef.current?.value ?? '', event as MessageComposerFormEvent);
    };

    return (
      <MessageComposerContext.Provider value={context}>
        <form
          ref={formRef}
          className={cn(
            messageComposerVariants({
              presentation,
              state,
            }),
            className,
          )}
          data-disabled={disabled || undefined}
          data-presentation={presentation}
          data-readonly={readOnly || undefined}
          onSubmit={handleSubmit}
          {...props}
          {...capture}
        >
          <fieldset className="contents" disabled={disabled}>
            {children}
          </fieldset>
        </form>
      </MessageComposerContext.Provider>
    );
  },
);

export interface MessageComposerEditorProps extends Omit<TextAreaProps, 'autoGrow'> {}

export const MessageComposerEditor = forwardRef<HTMLTextAreaElement, MessageComposerEditorProps>(
  function MessageComposerEditor(
    { className, disabled, maxRows = 8, minRows = 1, onKeyDown, readOnly, ...props },
    ref,
  ) {
    const composer = useMessageComposerContext('MessageComposer.Editor');
    const setEditorRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        composer.registerEditor(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [composer, ref],
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const nativeEvent = event.nativeEvent;
      const action = resolveMessageComposerKeyAction({
        enterKeyBehavior: composer.enterKeyBehavior,
        isComposing: nativeEvent.isComposing || Reflect.get(nativeEvent, 'keyCode') === 229,
        key: event.key,
        shiftKey: event.shiftKey,
      });
      if (action !== 'submit') return;
      event.preventDefault();
      composer.requestSubmit();
    };

    return (
      <EmbeddedTextArea
        ref={setEditorRef}
        autoGrow
        className={className}
        disabled={composer.disabled || disabled}
        maxRows={maxRows}
        minRows={minRows}
        onKeyDown={handleKeyDown}
        readOnly={composer.readOnly || readOnly}
        {...props}
        {...designSlot('MessageComposer', 'editor')}
      />
    );
  },
);

export type MessageComposerToolbarProps = HTMLAttributes<HTMLDivElement>;

export const MessageComposerToolbar = forwardRef<HTMLDivElement, MessageComposerToolbarProps>(
  function MessageComposerToolbar({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'message-composer-toolbar flex min-w-0 items-center justify-between gap-2 border-t border-divider px-2 py-1.5',
          className,
        )}
        {...props}
        {...designSlot('MessageComposer', 'toolbar')}
      />
    );
  },
);

export const MessageComposer = Object.assign(MessageComposerRoot, {
  Editor: MessageComposerEditor,
  Toolbar: MessageComposerToolbar,
});
