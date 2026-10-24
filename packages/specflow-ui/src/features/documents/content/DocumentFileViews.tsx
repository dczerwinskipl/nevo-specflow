import { useTranslation } from 'react-i18next';
import { Button, DescriptionList, ScrollArea, Typography, cn } from '@nevo/ui';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { documentRawUrl } from '../api';
import { typeTitle } from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';

const fileNameOf = (path: string) => path.split('/').at(-1) ?? path;

/** A byte count for people: bytes, kB or MB in the reader's language. */
export function formatFileSize(bytes: number, locale?: string): string {
  // `Intl` spells the byte unit out ("27 byte"); the symbol reads the same in both languages.
  if (bytes < 1000) return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  const [value, unit] =
    bytes < 1000
      ? [bytes, 'byte']
      : bytes < 1000 * 1000
        ? [bytes / 1000, 'kilobyte']
        : [bytes / (1000 * 1000), 'megabyte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value);
}

/**
 * An image document: the bytes from the raw route as an `<img>` (never inline SVG markup), fitted
 * to the area or at its actual size (Display menu). No frame around it.
 */
export function DocumentImageView({
  specId,
  document,
  actualSize,
}: {
  specId: string;
  document: Pick<DocumentContent, 'id' | 'path'>;
  actualSize: boolean;
}) {
  const image = (
    <img
      src={documentRawUrl(specId, document.id)}
      alt={fileNameOf(document.path)}
      className={cn(actualSize ? 'max-w-none' : 'max-h-full max-w-full object-contain')}
    />
  );
  // A large image is fitted to the area; a small one keeps its size at the top left, on the same
  // reading edge as a file's information (no lone image in the middle of an empty panel).
  return actualSize ? (
    <ScrollArea direction="both" className="min-h-0 flex-1" contentClassName="p-6">
      {image}
    </ScrollArea>
  ) : (
    <div className="flex min-h-0 flex-1 items-start justify-start p-6">{image}</div>
  );
}

/** Downloads a document's bytes (the raw route answers as an attachment: the page stays). */
export function downloadDocument(specId: string, document: Pick<DocumentContent, 'id' | 'path'>) {
  const link = globalThis.document.createElement('a');
  link.href = documentRawUrl(specId, document.id, true);
  link.download = fileNameOf(document.path);
  link.click();
}

type FileFacts = Pick<DocumentContent, 'path' | 'type' | 'kind' | 'size' | 'mediaType'>;

/**
 * A file that cannot be shown here (binary, or text above the read limit): a short line, its
 * facts and Download, left-aligned on the reading measure (not a centred empty-area composition).
 */
export function DocumentFileView({
  document,
  onDownload,
}: {
  document: FileFacts;
  onDownload: () => void;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="max-w-content-narrow p-6">
        <DocumentFileSummary document={document} onDownload={onDownload} />
      </div>
    </ScrollArea>
  );
}

/** The line, the facts and Download of a file that cannot be shown (embeddable in any scroller). */
export function DocumentFileSummary({
  document,
  onDownload,
}: {
  document: FileFacts;
  onDownload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const catalogue = useDocumentCatalogue();
  const tooLarge = document.kind === 'text';
  const facts: [string, string][] = [
    [t('documents.binary.path'), document.path],
    [
      t('documents.binary.type'),
      document.type ? typeTitle(catalogue.data, document.type) : t('documents.tree.noType'),
    ],
    [t('documents.binary.size'), formatFileSize(document.size, i18n.resolvedLanguage)],
    [t('documents.binary.format'), document.mediaType],
  ];
  return (
    <div className="grid gap-4">
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {tooLarge ? t('documents.binary.tooLarge') : t('documents.binary.cannotShow')}
      </Typography>
      <DescriptionList aria-label={t('documents.binary.label')}>
        {facts.map(([term, detail]) => (
          <DescriptionList.Item key={term}>
            <DescriptionList.Term>{term}</DescriptionList.Term>
            <DescriptionList.Detail emphasis="secondary">
              <span className="wrap-anywhere">{detail}</span>
            </DescriptionList.Detail>
          </DescriptionList.Item>
        ))}
      </DescriptionList>
      <div>
        <Button variant="secondary" onClick={onDownload}>
          {t('documents.actions.download')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The body of a document that has no text to render (image, binary, text above the read limit),
 * for read-only previews outside the Documents workspace: the image fitted to the width, else the
 * file summary with Download.
 */
export function DocumentNonTextPreview({
  specId,
  document,
}: {
  specId: string;
  document: Pick<DocumentContent, 'id' | 'path' | 'type' | 'kind' | 'size' | 'mediaType'>;
}) {
  if (document.kind === 'image')
    return (
      <img
        src={documentRawUrl(specId, document.id)}
        alt={fileNameOf(document.path)}
        className="max-w-full"
      />
    );
  return (
    <DocumentFileSummary
      document={document}
      onDownload={() => downloadDocument(specId, document)}
    />
  );
}
