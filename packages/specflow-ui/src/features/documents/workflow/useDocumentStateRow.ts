import { useCallback } from 'react';
import type { TreeRowState } from '../../../shared/document-tree';
import { useMessage } from '../../../i18n/message';
import type { DocumentStateLabel } from './documentState';

export interface DocumentStateRow {
  /** The row's trailing label; undefined when the document carries none. */
  readonly state: TreeRowState | undefined;
  /** Tooltip lines that follow the row's own (the full label, the gate, missing sections). */
  readonly details: readonly string[];
}

/**
 * Translates a {@link DocumentStateLabel} into what `TreeDocumentRow` takes. In a narrow row the
 * label either shortens (`short`: beside the active step on screen, the step-less form) or keeps
 * every word on its own line under the name (`wrap`: where the step is named, its title cut with
 * the full label in the tooltip).
 */
export function useDocumentStateRow(
  narrow: 'short' | 'wrap' = 'short',
): (label: DocumentStateLabel | undefined) => DocumentStateRow {
  const text = useMessage();

  return useCallback(
    (label) => {
      if (!label) {
        return { state: undefined, details: [] };
      }

      const full = text(label.text);
      const short = text(label.short);

      return {
        state: {
          text: full,
          tone: label.tone,
          // One text when the narrow form is the same.
          ...(narrow === 'wrap' ? { wrap: true } : short !== full ? { shortText: short } : {}),
        },
        details: label.details.map(text),
      };
    },
    [narrow, text],
  );
}
