import { EditorView } from '@codemirror/view';

/**
 * The surface every code view sits on: the DS text-field fill, control border and radius, with the
 * focus ring recolouring that border (no second frame). Documents' source editor and the Session
 * tool parameters/response blocks both use it, so code looks the same wherever it is shown.
 */
export const codeSurfaceClassName =
  'rounded-control border border-solid border-border-default bg-surface-control has-[:focus-visible]:border-focus-ring';

/** The fill of `codeSurfaceClassName`: what an edge fade over the code must fade into. */
export const codeSurfaceColor = 'var(--color-surface-control)';

/** Mono text, gutter, selection and current line on DS tokens; the surface itself is the mount's. */
export const codeViewTheme = EditorView.theme(
  {
    // The surface (field fill, border, radius, focus border) belongs to the mount element, so the
    // editable area reads like the DS text fields and differs from the page.
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: 'var(--color-content-primary)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-content-primary)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
      { background: 'color-mix(in srgb, var(--color-content-link) 32%, transparent)' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-code-md)',
      lineHeight: 'var(--text-code-md--line-height)',
    },
    // The block inset is on the content, the inline inset on each line: the current-line
    // tint then fills the line from the gutter edge, with no hole between the two.
    '.cm-content': { padding: 'var(--spacing-control-padding-default) 0' },
    '.cm-line': {
      padding: '0 var(--spacing-control-padding-default) 0 var(--spacing-control-padding-compact)',
    },
    // The line numbers are a quiet band of their own (a slightly different surface), so
    // the text column starts where that band ends; no hairline between them.
    '.cm-gutters': {
      backgroundColor: 'var(--color-surface-subtle)',
      color: 'var(--color-content-muted)',
      border: 'none',
    },
    // At least two digits wide, so the gutter does not jump from line 9 to 10.
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '2ch',
      padding: '0 var(--spacing-control-padding-compact)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--color-surface-selected) 55%, transparent)',
    },
    '.cm-activeLineGutter': { color: 'var(--color-content-primary)' },
    // The visible focus indicator is the focus-ring border of the editor mount, no extra frame.
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

/**
 * A view without the line-number gutter: the text keeps the same inset on both sides instead of
 * the compact start inset that only made sense next to the gutter band.
 */
export const gutterlessTheme = EditorView.theme({
  '.cm-line': { padding: '0 var(--spacing-control-padding-default)' },
});

/**
 * A view scrolled by an ancestor (`scrolling="container"`): it grows to its whole text, both ways,
 * and lets the ancestor scroll it. It is as wide as its longest line (at least its box), so the
 * sticky line-number gutter stays pinned however far the ancestor scrolls sideways.
 */
export const containerScrollingTheme = EditorView.theme({
  '&': { width: 'max-content', minWidth: '100%' },
  '.cm-scroller': { overflow: 'visible' },
});
