import { Link, cn, hitAreaClassName } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecRowModel } from '../presentation';

/** The pull request(s) of a row: a link for one, a count for several, nothing for none. */
export function SpecPullRequests({ item }: { readonly item: SpecRowModel }) {
  const { t } = useTranslation();
  const pr = item.pullRequests;
  if (pr?.kind === 'multiple') {
    return <span>{t('specifications.pullRequests', { count: pr.count })}</span>;
  }

  if (pr?.kind !== 'single') {
    return null;
  }

  // The touch target is the DS hit area (a pseudo-element up to `--target-size`), so the link keeps
  // the height of its text line and never adds an empty band under the row's metadata.
  return (
    <Link
      className={cn(
        'pointer-events-auto z-10 inline-flex items-center rounded-control-inline',
        hitAreaClassName,
      )}
      href={pr.href}
      aria-label={t('specifications.openPullRequest', { number: pr.number, title: item.title })}
    >
      {t('common.pullRequestNumber', { number: pr.number })}
    </Link>
  );
}
