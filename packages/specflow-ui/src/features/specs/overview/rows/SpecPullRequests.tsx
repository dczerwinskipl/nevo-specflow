import { Link, cn } from '@nevo/ui';
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

  return (
    <Link
      className={cn(
        'pointer-events-auto relative z-10 inline-flex min-h-6 items-center rounded-control-inline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:items-start [@media(pointer:coarse)]:rounded-none',
        item.collection === 'archive' && '[@media(pointer:coarse)]:pt-1',
      )}
      href={pr.href}
      aria-label={t('specifications.openPullRequest', { number: pr.number, title: item.title })}
    >
      {t('common.pullRequestNumber', { number: pr.number })}
    </Link>
  );
}
