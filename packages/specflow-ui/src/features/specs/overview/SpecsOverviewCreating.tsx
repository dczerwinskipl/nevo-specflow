import type { ReactNode } from 'react';
import { Icon, Spinner, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

/** An unfinished Create operation the owner can return to (read from the client-side ledger). */
export interface CreatingSpecification {
  /** The name the owner typed, when known. */
  readonly title?: string;
  /** The progress page of the operation. */
  readonly href: string;
  /** The router's link, when the host has one; a plain anchor otherwise. */
  readonly renderLink?: (children: ReactNode, ariaLabel: string, className: string) => ReactNode;
}

const linkClassName =
  'flex min-w-0 items-center gap-3 rounded-composite border border-border-subtle px-3 py-2 text-content-primary no-underline hover:bg-surface-hover focus-visible:outline-2';

/**
 * The persistent way back to a Create that is still running: one quiet row above the list,
 * "Creating <name>… (in progress)", linking to its progress page. It exists only while the
 * operation is unfinished; the host decides that.
 */
export function SpecsOverviewCreating({ creating }: { creating: CreatingSpecification }) {
  const { t } = useTranslation();
  const name = creating.title;
  const label = name
    ? t('specifications.creating.named', { name })
    : t('specifications.creating.unnamed');
  const aria = name
    ? t('specifications.creating.aria', { name })
    : t('specifications.creating.open');
  const content = (
    <>
      <Spinner size="sm" className="text-status-info" />
      <Typography as="span" variant="body-md" className="min-w-0 break-words">
        {label}{' '}
        <Typography as="span" variant="body-sm" className="text-content-secondary">
          {t('specifications.creating.inProgress')}
        </Typography>
      </Typography>
      <Icon name="chevron-right" size="sm" className="ml-auto shrink-0 text-content-muted" />
    </>
  );
  return (
    <div data-creating-specification className="min-w-0">
      {creating.renderLink ? (
        creating.renderLink(content, aria, linkClassName)
      ) : (
        <a href={creating.href} aria-label={aria} className={linkClassName}>
          {content}
        </a>
      )}
    </div>
  );
}
