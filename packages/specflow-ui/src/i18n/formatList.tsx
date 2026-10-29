import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Joins plain items with the conjunction and separators of the locale ("a, b and c" / "a, b i c"). */
export function formatList(items: readonly string[], locale?: string): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
}

/**
 * The same list for items that are elements (a link, a branch reference). The locale decides the
 * separators and the conjunction; the items keep their own markup.
 */
export function FormattedList({ items }: { readonly items: readonly ReactNode[] }) {
  const { i18n } = useTranslation();
  const placeholders = items.map((_, index) => String(index));
  const parts = new Intl.ListFormat(i18n.resolvedLanguage, {
    style: 'long',
    type: 'conjunction',
  }).formatToParts(placeholders);

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.type === 'element' ? items[Number(part.value)] : part.value}
        </Fragment>
      ))}
    </>
  );
}
