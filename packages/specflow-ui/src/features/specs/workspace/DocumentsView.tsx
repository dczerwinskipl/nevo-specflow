import { useState } from 'react';
import { Button, Icon, InformationList, MarkdownDocument, TextInput, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../shared/OperationalList';
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
            <Typography as="h2" variant="title-md" className="font-semibold text-content-primary">
              {activeDoc.title}
            </Typography>
            <p className="mt-1 text-body-xs text-content-muted">
              {t('specification.markdownFileMeta')}
            </p>
          </div>

          <div className="grid gap-3 pt-2">
            {activeDoc.summary ? (
              <p className="text-body-sm text-content-secondary">{activeDoc.summary}</p>
            ) : null}

            {activeDoc.sections && activeDoc.sections.length > 0 ? (
              activeDoc.sections.map((section, idx) => (
                <div key={idx} className="grid gap-1">
                  <Typography
                    as="h3"
                    variant="title-sm"
                    className="font-medium text-content-primary pt-2"
                  >
                    {section.heading}
                  </Typography>
                  {section.content ? <MarkdownDocument source={section.content} /> : null}
                  {section.items && section.items.length > 0 ? (
                    <ul className="list-disc pl-5 text-body-sm grid gap-1.5">
                      {section.items.map((item, itemIdx) => (
                        <li key={itemIdx}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))
            ) : activeDoc.content ? (
              <MarkdownDocument source={activeDoc.content} />
            ) : null}
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
        <Typography as="h2" variant="title-md" className="font-semibold text-content-primary">
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

      <InformationList>
        {filtered.map((doc) => (
          <OperationalRow
            key={doc.id}
            titleAs="h3"
            primary={doc.title}
            onPrimaryClick={() => onSelectDoc(doc.id)}
            compactFacts={[`${doc.kind} · Markdown`]}
            trailing={
              <Button variant="secondary" size="sm" onClick={() => onSelectDoc(doc.id)}>
                {t('specification.readDocumentAction')}
              </Button>
            }
          />
        ))}
      </InformationList>
    </div>
  );
}
