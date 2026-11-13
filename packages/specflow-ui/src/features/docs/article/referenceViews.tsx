import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Link, Popover, PopoverContent, PopoverTrigger, Typography } from '@nevo/ui';
import type { InertImage } from '../links/imagePolicy';
import type { InertLinkReason } from '../links/linkPolicy';
import type { DocsReferenceViews } from '../links/useDocsReferenceRenderers';
import { docsHref } from '../reader/readerLocation';
import { ArticleSectionsContext, useArticleNavigation } from './articleContext';

/** A link to another current document: its reader address, opened by the article's host. */
function DocumentLink({
  documentId,
  sectionId,
  title,
  children,
}: {
  workspaceId: string;
  documentId: string;
  sectionId?: string;
  title?: string;
  children: ReactNode;
}) {
  const navigation = useArticleNavigation();

  return (
    <Link
      href={docsHref(navigation.workspaceId, documentId, sectionId)}
      title={title}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }

        event.preventDefault();
        navigation.openDocument(documentId, sectionId);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * A link to a section of the document being read. An id the article does not list (a GFM
 * footnote, `user-content-fn-1`) is looked up as an element id inside the article.
 */
function SectionLink({
  sectionId,
  title,
  children,
}: {
  sectionId: string;
  title?: string;
  children: ReactNode;
}) {
  const sections = useContext(ArticleSectionsContext);

  return (
    <Link
      href={`#${encodeURIComponent(sectionId)}`}
      title={title}
      onClick={(event) => {
        event.preventDefault();
        sections?.goToSection(sectionId);
      }}
    >
      {children}
    </Link>
  );
}

function ReferencePopover({
  trigger,
  title,
  reason,
  target,
  action,
}: {
  trigger: ReactNode;
  title: string;
  reason: string;
  target?: string;
  action?: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline cursor-pointer text-left text-content-secondary underline decoration-dotted underline-offset-4"
        >
          {trigger}
          <span className="sr-only"> ({title})</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-2 p-3">
        <Typography as="p" variant="label-md">
          {title}
        </Typography>
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {reason}
        </Typography>
        {target ? (
          <Typography
            as="code"
            variant="code-md"
            className="select-all break-all text-content-muted"
          >
            {target}
          </Typography>
        ) : null}
        {action}
      </PopoverContent>
    </Popover>
  );
}

function SuccessorLink({ documentId, title }: { documentId: string; title: string }) {
  const { t } = useTranslation();
  const { workspaceId } = useArticleNavigation();

  return (
    <DocumentLink workspaceId={workspaceId} documentId={documentId}>
      {t('docs.state.openSuccessor', { title })}
    </DocumentLink>
  );
}

/** A reference the reader does not open: focusable text whose popover gives the reason. */
function InertReference({ inert, children }: { inert: InertLinkReason; children: ReactNode }) {
  const { t } = useTranslation();
  if (inert.reason === 'superseded') {
    return (
      <ReferencePopover
        trigger={children}
        title={t('docs.reference.superseded')}
        reason={t('docs.reference.reason.superseded')}
        target={inert.target}
        action={
          inert.successor ? (
            <SuccessorLink documentId={inert.successor.documentId} title={inert.successor.title} />
          ) : undefined
        }
      />
    );
  }

  const reason =
    inert.reason === 'skipped'
      ? t('docs.reference.reason.skipped', { error: inert.error })
      : t(`docs.reference.reason.${inert.reason}`);

  return (
    <ReferencePopover
      trigger={children}
      title={t('docs.reference.linkNotOpened')}
      reason={reason}
      // An unsafe address is never repeated: the renderer may already have emptied it.
      target={inert.reason === 'unsafe-scheme' ? undefined : inert.target}
    />
  );
}

/** An image is never loaded: its alt text with an image glyph, and the source on demand. */
function InertImageView({ image }: { image: InertImage }) {
  const { t } = useTranslation();

  return (
    <ReferencePopover
      trigger={
        <>
          <Icon name="image" size="sm" className="mr-1 inline align-[-2px] text-content-muted" />
          {image.alt || t('docs.reference.image')}
        </>
      }
      title={t('docs.reference.imageNotShown')}
      reason={t('docs.reference.reason.image')}
      target={image.source}
    />
  );
}

/** The reader's reference views: one stable object, so the Markdown is not re-rendered. */
export const docsReferenceViews: DocsReferenceViews = {
  DocumentLink,
  SectionLink,
  InertReference,
  InertImage: InertImageView,
};
