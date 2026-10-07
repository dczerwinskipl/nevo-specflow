import { useState } from 'react';
import { Button, Icon, TextInput, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { DocumentItem } from './model';

export interface DocumentsViewProps {
  readonly documents: readonly DocumentItem[];
  readonly activeDocId: string | null;
  readonly docOrigin: 'work' | 'documents';
  readonly onSelectDoc: (id: string | null) => void;
  readonly onBackToOrigin: () => void;
}

export function DocumentsView({
  documents,
  activeDocId,
  docOrigin,
  onSelectDoc,
  onBackToOrigin,
}: DocumentsViewProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const activeDoc = documents.find((d) => d.id === activeDocId);

  if (activeDoc) {
    return (
      <div className="grid max-w-content-standard gap-6 py-2">
        <button
          type="button"
          onClick={onBackToOrigin}
          className="flex w-fit items-center gap-2 text-body-sm font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <Icon name="arrow-right" size="sm" className="rotate-180" />
          <span>
            {docOrigin === 'work'
              ? t('specification.backToWorkView')
              : t('specification.backToDocuments')}
          </span>
        </button>

        <article className="grid gap-4 leading-relaxed text-content-secondary">
          <div>
            <Typography as="h1" variant="title-md" className="font-semibold text-content-primary">
              {activeDoc.title}
            </Typography>
            <p className="mt-1 text-body-xs text-content-muted">
              {t('specification.markdownFileMeta')}
            </p>
          </div>

          <div className="grid gap-3 pt-2">
            <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
              {t('specification.docPurposeHeading')}
            </Typography>
            <p className="text-body-sm">{t('specification.docPurposeContent')}</p>

            <Typography
              as="h2"
              variant="title-sm"
              className="font-medium text-content-primary pt-2"
            >
              {t('specification.docAssumptionsHeading')}
            </Typography>
            <p className="text-body-sm">{t('specification.docAssumptionsContent')}</p>

            <Typography
              as="h2"
              variant="title-sm"
              className="font-medium text-content-primary pt-2"
            >
              {t('specification.docAcceptanceHeading')}
            </Typography>
            <ul className="list-disc pl-5 text-body-sm grid gap-1.5">
              <li>{t('specification.docAcceptanceItem1')}</li>
              <li>{t('specification.docAcceptanceItem2')}</li>
              <li>{t('specification.docAcceptanceItem3')}</li>
            </ul>

            <Typography
              as="h2"
              variant="title-sm"
              className="font-medium text-content-primary pt-2"
            >
              {t('specification.docOpenDecisionsHeading')}
            </Typography>
            <p className="text-body-sm">{t('specification.docOpenDecisionsContent')}</p>
          </div>
        </article>
      </div>
    );
  }

  const filtered = documents.filter((d) =>
    d.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="grid max-w-content-standard gap-6 py-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Typography as="h1" variant="title-md" className="font-semibold text-content-primary">
          {t('specification.documentsHeading')}
        </Typography>
        <TextInput
          placeholder={t('specification.searchDocumentPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label={t('specification.searchDocumentPlaceholder')}
          className="w-full sm:w-64"
        />
      </div>

      <Typography variant="body-sm" className="text-content-muted">
        {documents.length > 0
          ? t('specification.documentsConfiguredNotice')
          : t('specification.noDocumentsNotice')}
      </Typography>

      <div className="divide-y divide-border-subtle">
        {filtered.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="font-medium text-content-primary [overflow-wrap:anywhere]">
                {doc.title}
              </div>
              <div className="text-body-xs text-content-muted">{doc.kind} · Markdown</div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => onSelectDoc(doc.id)}>
              {t('specification.readDocumentAction')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
