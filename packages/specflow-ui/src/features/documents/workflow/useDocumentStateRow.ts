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

/** Translates a {@link DocumentStateLabel} into what `TreeDocumentRow` takes. */
export function useDocumentStateRow(): (label: DocumentStateLabel | undefined) => DocumentStateRow {
  const text = useMessage();

  return useCallback(
    (label) => {
      if (!label) {
        return { state: undefined, details: [] };
      }

      const full = text(label.text);
      const short = text(label.short);

      return {
        // One text when the narrow form is the same.
        state: { text: full, ...(short !== full ? { shortText: short } : {}), tone: label.tone },
        details: label.details.map(text),
      };
    },
    [text],
  );
}
