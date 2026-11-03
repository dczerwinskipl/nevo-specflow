import type { CSSProperties } from 'react';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { ScrollArea, cn } from '@nevo/ui';
import {
  CodeView,
  codeSurfaceClassName,
  type CodeLanguage,
  type CodeViewSetup,
} from '../../../shared/code-view';

const readOnlyNavigation = (): CodeViewSetup => ({ extensions: [keymap.of(defaultKeymap)] });

/**
 * A tool's parameters or response on the product's one code view — the same mono type, DS-token
 * colouring and field surface as a document's source — read-only, with lines never re-wrapped so
 * indentation and columns survive. Parameters and response look the same; only the `language`
 * differs (JSON coloured as JSON, anything else plain).
 *
 * Line numbers (`lineNumbers`) only where the product produced the text's lines itself — JSON it
 * pretty-printed. Text shown verbatim (a tool's stdout, a file the Read tool returned with its own
 * `cat -n` numbers) keeps exactly its own content: no second gutter numbering its numbers, and no
 * attempt to strip numbers out of it either.
 *
 * The view grows to its text and a DS `ScrollArea` scrolls it, capped in height (`max-h-80`), both
 * ways: a long response scrolls inside its own block instead of stretching the Secondary panel,
 * and its sideways scroll is reachable without first scrolling to the bottom. The ScrollArea's end
 * edge cues show "more this way" at a clipped right or bottom edge: they fade the code into
 * `canvas`, the page surface under the panel (the field fill itself is translucent, so fading into
 * it would not hide any text), widened from the DS 1.25rem so the fade spans several characters.
 * The start edges have no cue: the left one would cover the line numbers, which stay pinned.
 *
 * The text itself is the one tab stop (a read-only `textbox` named `label`): arrow keys and Page
 * keys move through it and scroll the block; it never traps focus (Tab leaves it).
 */
export function ToolDetailCode({
  text,
  language,
  label,
  lineNumbers,
}: {
  text: string;
  language: CodeLanguage;
  label: string;
  /** Number the lines: only for text the product formatted itself (pretty-printed JSON). */
  lineNumbers: boolean;
}) {
  return (
    <ScrollArea
      className={cn('min-w-0 overflow-hidden', codeSurfaceClassName)}
      direction="both"
      startEdge="hidden"
      indicatorColor="var(--color-canvas)"
      style={{ '--scroll-edge-size': '3rem' } as CSSProperties}
      tabIndex={-1}
      viewportClassName="max-h-80"
    >
      <CodeView
        value={text}
        language={language}
        label={label}
        readOnly
        wrapLines={false}
        activeLine={false}
        lineNumbers={lineNumbers}
        scrolling="container"
        setup={readOnlyNavigation}
      />
    </ScrollArea>
  );
}
