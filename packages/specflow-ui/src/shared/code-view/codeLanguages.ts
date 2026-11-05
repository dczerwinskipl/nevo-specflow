import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

/** What the text is: it decides only the syntax colouring, never the surface or the gutter. */
export type CodeLanguage = 'markdown' | 'json' | 'plain';

/** Markdown structure on DS tokens: headings/links in the link hue, code on a selected tint. */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--color-content-link)', fontWeight: '600' },
  { tag: tags.list, color: 'var(--color-content-link-hover)' },
  {
    tag: tags.monospace,
    color: 'color-mix(in srgb, var(--color-content-link) 65%, var(--color-content-primary))',
    backgroundColor: 'var(--color-surface-selected)',
  },
  { tag: tags.processingInstruction, color: 'var(--color-content-muted)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--color-content-link)', textDecoration: 'underline' },
]);

/**
 * JSON on the same DS tokens, three hues at most so a dense payload stays calm: keys take the link
 * hue Markdown uses for structure, string values the success hue, the literal constants (numbers,
 * `true`/`false`, `null`) the attention hue, and the punctuation recedes to muted. Every one of
 * these tokens meets the DS text-contrast checks on the darkest surface (`contrast.test.ts`).
 */
const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--color-content-link)' },
  { tag: tags.string, color: 'var(--color-status-success)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-status-attention)' },
  {
    tag: [tags.separator, tags.brace, tags.squareBracket],
    color: 'var(--color-content-muted)',
  },
]);

export function codeLanguageExtensions(language: CodeLanguage): Extension[] {
  switch (language) {
    case 'markdown':
      return [markdown(), syntaxHighlighting(markdownHighlight)];
    case 'json':
      return [json(), syntaxHighlighting(jsonHighlight)];
    case 'plain':
      return [];
  }
}
