import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type InputEvent as ReactInputEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { useFieldControl } from '../Field';
import { textControlDesignState } from '../shared/textControlState';

const textAreaBaseClassName =
  'text-area scrollbar-subtle w-full font-sans text-body-md text-content-primary transition-colors placeholder:text-content-placeholder disabled:cursor-not-allowed';

export const textAreaControlClassName = `${textAreaBaseClassName} rounded-control border border-solid border-border-default bg-surface-control p-control-padding-default disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-content-muted disabled:opacity-60`;

const embeddedTextAreaClassName = `${textAreaBaseClassName} text-area-embedded min-h-0 rounded-none border-0 bg-transparent px-4 py-3.5 outline-none disabled:bg-transparent disabled:text-content-muted disabled:opacity-100`;

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
  maxRows?: number;
  minRows?: number;
}

export function autoGrowMetrics(
  scrollHeight: number,
  lineHeight: number,
  verticalChrome: number,
  minRows: number,
  maxRows: number,
) {
  const safeMinimumRows = Math.max(1, minRows);
  const safeMaximumRows = Math.max(safeMinimumRows, maxRows);
  const minimum = lineHeight * safeMinimumRows + verticalChrome;
  const maximum = lineHeight * safeMaximumRows + verticalChrome;
  return {
    height: Math.min(Math.max(scrollHeight, minimum), maximum),
    overflowing: scrollHeight > maximum,
  };
}

function createTextArea(presentation: 'control' | 'embedded') {
  return forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaImplementation(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      autoFocus,
      autoGrow = false,
      className,
      disabled,
      id,
      maxRows = 8,
      minRows = 3,
      onInput,
      rows,
      value,
      ...props
    },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => localRef.current!, []);
    const field = useFieldControl({ ariaDescribedBy, ariaInvalid, disabled, id });
    const capture = useDesignMetadata('TextArea', {
      state: textControlDesignState({
        ariaInvalid: field.ariaInvalid,
        autoFocus,
        disabled: field.disabled,
      }),
    });

    const resizeToContent = () => {
      const node = localRef.current;
      if (!node) return;
      if (!autoGrow) {
        node.style.height = '';
        node.style.overflowY = '';
        return;
      }
      node.style.height = 'auto';
      const computed = window.getComputedStyle(node);
      const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
      const verticalChrome = [
        computed.paddingTop,
        computed.paddingBottom,
        computed.borderTopWidth,
        computed.borderBottomWidth,
      ].reduce((total, part) => total + (Number.parseFloat(part) || 0), 0);
      const metrics = autoGrowMetrics(
        node.scrollHeight,
        lineHeight,
        verticalChrome,
        minRows,
        maxRows,
      );
      node.style.height = `${metrics.height}px`;
      node.style.overflowY = metrics.overflowing ? 'auto' : 'hidden';
    };

    useLayoutEffect(resizeToContent, [autoGrow, maxRows, minRows, value]);

    const handleInput = (event: ReactInputEvent<HTMLTextAreaElement>) => {
      resizeToContent();
      onInput?.(event);
    };

    return (
      <textarea
        ref={localRef}
        aria-describedby={field.ariaDescribedBy}
        aria-invalid={field.ariaInvalid}
        autoFocus={autoFocus}
        className={cn(
          presentation === 'embedded' ? embeddedTextAreaClassName : textAreaControlClassName,
          autoGrow ? 'resize-none' : 'resize-y',
          className,
        )}
        disabled={field.disabled}
        id={field.id}
        rows={rows ?? Math.max(1, minRows)}
        value={value}
        onInput={handleInput}
        {...props}
        data-control-surface={presentation === 'embedded' ? 'embedded' : undefined}
        {...(field.insideField ? designSlot('Field', 'control') : {})}
        {...capture}
      />
    );
  });
}

export const TextArea = createTextArea('control');

/** Internal composition helper; intentionally omitted from the public forms barrel. */
export const EmbeddedTextArea = createTextArea('embedded');
