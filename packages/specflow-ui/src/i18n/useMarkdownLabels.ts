import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarkdownDocumentLabels } from '@nevo/ui';

/** Localized accessible names the shared Markdown renderer generates (tables, code, task state). */
export function useMarkdownLabels(): MarkdownDocumentLabels {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      table: t('specification.markdownTable'),
      codeBlock: t('specification.markdownCodeBlock'),
      completedTask: t('specification.markdownTaskDone'),
      incompleteTask: t('specification.markdownTaskOpen'),
    }),
    [t],
  );
}
