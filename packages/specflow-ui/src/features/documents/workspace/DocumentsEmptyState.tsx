import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';
import { fileNameOf } from '../tabs/documentTabs';

/** At most this many documents are suggested. */
export const suggestedDocumentCount = 5;

/** The documents worth opening first: required ones, then the rest in tree order. */
export function suggestedDocuments<T extends { id: string; path: string; required?: boolean }>(
  documents: readonly T[],
): T[] {
  return [
    ...documents.filter((document) => document.required),
    ...documents.filter((document) => !document.required),
  ].slice(0, suggestedDocumentCount);
}

/**
 * The document area with nothing open: one line and a few documents to start from. Nothing opens by
 * itself, so closing the last tab does not bring a document back.
 */
export function DocumentsEmptyState({
  documents,
  onOpen,
}: {
  documents: readonly { id: string; path: string; required?: boolean }[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const suggested = suggestedDocuments(documents);
  return (
    // Left-aligned on the reading measure under the header, like the document and the list.
    <div className="flex h-full min-h-0 max-w-content-narrow flex-col gap-4 p-6">
      <Typography as="p" variant="title-sm">
        {t('documents.empty.title')}
      </Typography>
      {suggested.length > 0 && (
        <ul aria-label={t('documents.empty.suggested')} className="flex flex-col items-start gap-1">
          {suggested.map((document) => (
            <li key={document.id}>
              <Button
                variant="ghost"
                leadingIcon="file"
                title={document.path}
                aria-label={t('documents.empty.open', { name: fileNameOf(document.path) })}
                onClick={() => onOpen(document.id)}
              >
                {fileNameOf(document.path)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
