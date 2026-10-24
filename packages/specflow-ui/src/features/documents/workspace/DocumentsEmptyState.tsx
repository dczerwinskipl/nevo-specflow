import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';
import { fileNameOf } from '../tabs/documentTabs';

/** At most this many documents are suggested. */
export const suggestedDocumentCount = 5;

/** What the empty state needs to know about a document of the tree. */
export interface SuggestableDocument {
  id: string;
  path: string;
  /** Only registered documents are suggested (an unclassified file never is). */
  classification?: 'registered' | 'unclassified';
  type?: string;
  /** The overview: always the first suggestion. */
  protected?: boolean;
}

/**
 * The documents worth opening first: the protected overview, then registered documents of a type
 * the archetype suggests (tree order), then the other registered documents. Unclassified and
 * dangling entries are never suggested.
 */
export function suggestedDocuments<T extends SuggestableDocument>(
  documents: readonly T[],
  suggestedTypes: readonly string[] = [],
): T[] {
  const registered = documents.filter((document) => document.classification !== 'unclassified');
  const suggested = (document: T) =>
    document.type !== undefined && suggestedTypes.includes(document.type);
  return [
    ...registered.filter((document) => document.protected),
    ...registered.filter((document) => !document.protected && suggested(document)),
    ...registered.filter((document) => !document.protected && !suggested(document)),
  ].slice(0, suggestedDocumentCount);
}

/**
 * The document area with nothing open: one line and a few documents to start from. Nothing opens by
 * itself, so closing the last tab does not bring a document back.
 */
export function DocumentsEmptyState({
  documents,
  suggestedTypes,
  onOpen,
}: {
  documents: readonly SuggestableDocument[];
  /** Types of the optional templates of the Specification's archetype. */
  suggestedTypes?: readonly string[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const suggested = suggestedDocuments(documents, suggestedTypes);
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
