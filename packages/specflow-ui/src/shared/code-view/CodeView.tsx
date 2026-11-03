import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view';
import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
  type StateEffect,
} from '@codemirror/state';
import { codeLanguageExtensions, type CodeLanguage } from './codeLanguages';
import { codeViewTheme, containerScrollingTheme } from './codeViewTheme';

/** Read once, when the view is created; the owner's own behaviour on top of the shared code view. */
export interface CodeViewSetup {
  selection?: { anchor: number; head?: number };
  scrollTo?: StateEffect<unknown>;
  /** Keymaps, history, listeners: placed before the shared change listener and theme. */
  extensions?: Extension[];
  /** Runs right after the view exists; its cleanup runs right before the view is destroyed. */
  attach?: (view: EditorView) => () => void;
}

export interface CodeViewProps {
  value: string;
  language: CodeLanguage;
  /** The accessible name of the text (a `textbox`, `aria-readonly` when `readOnly`). */
  label: string;
  /** The text can be read, selected and copied but not changed. */
  readOnly?: boolean;
  /** Long lines wrap at the edge (else the view scrolls sideways). Changes in place. */
  wrapLines?: boolean;
  /** Marks the caret's line and its number (an editor's cue; a passive viewer turns it off). */
  activeLine?: boolean;
  /**
   * `own`: the view fills its mount and scrolls itself. `container`: the view grows to its text and
   * an ancestor scroller (for example a DS `ScrollArea` with its edge cues) scrolls it.
   */
  scrolling?: 'own' | 'container';
  onChange?: (value: string) => void;
  setup?: (doc: string) => CodeViewSetup;
  className?: string;
  mountProps?: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'> &
    Record<`data-${string}`, string>;
}

/**
 * The one code view of the product (CodeMirror): line-number gutter, DS mono type, DS-token syntax
 * colouring per `language`, editable or read-only. The view is created once per language, label,
 * read-only state and scrolling mode; later `value` changes are applied to it in place.
 */
export function CodeView({
  value,
  language,
  label,
  readOnly = false,
  wrapLines = true,
  activeLine = true,
  scrolling = 'own',
  onChange,
  setup,
  className,
  mountProps,
}: CodeViewProps) {
  const mount = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const emittedValues = useRef(new Set<string>()),
    applyingExternal = useRef(false);
  const latest = useRef({ onChange, setup, activeLine });
  // Line wrapping is reconfigured in place: toggling it never rebuilds the view (caret, history).
  const [wrapping] = useState(() => new Compartment());
  const wrapAtCreation = useRef(wrapLines);
  useLayoutEffect(() => {
    latest.current = { onChange, setup, activeLine };
  });
  useEffect(() => {
    const doc = value;
    const owner = latest.current.setup?.(doc) ?? {};
    const editor = new EditorView({
      parent: mount.current!,
      scrollTo: owner.scrollTo,
      state: EditorState.create({
        doc,
        selection: owner.selection,
        extensions: [
          lineNumbers(),
          ...(latest.current.activeLine
            ? [highlightActiveLineGutter(), highlightActiveLine()]
            : []),
          drawSelection(),
          ...codeLanguageExtensions(language),
          wrapping.of(wrapAtCreation.current ? EditorView.lineWrapping : []),
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0' }),
          ...(owner.extensions ?? []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternal.current) {
              const text = update.state.doc.toString();
              emittedValues.current.add(text);
              latest.current.onChange?.(text);
            }
          }),
          codeViewTheme,
          ...(scrolling === 'container' ? [Prec.highest(containerScrollingTheme)] : []),
        ],
      }),
    });
    view.current = editor;
    const detach = owner.attach?.(editor);

    return () => {
      detach?.();
      editor.destroy();
      view.current = null;
    };
    // The initial text is read at creation; later value changes are synchronised by the effect
    // below, so they must not rebuild (and reset) the CodeMirror view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, label, readOnly, scrolling]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }

    wrapAtCreation.current = wrapLines;
    editor.dispatch({ effects: wrapping.reconfigure(wrapLines ? EditorView.lineWrapping : []) });
  }, [wrapLines, wrapping]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }

    // Delayed React acknowledgements must not replace newer CodeMirror keystrokes.
    if (emittedValues.current.has(value)) {
      if (editor.state.doc.toString() === value) {
        emittedValues.current.clear();
      } else {
        emittedValues.current.delete(value);
      }

      return;
    }

    if (editor.state.doc.toString() !== value) {
      applyingExternal.current = true;
      try {
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
      } finally {
        applyingExternal.current = false;
      }
    }
  }, [value]);

  return <div ref={mount} className={className} {...mountProps} />;
}
