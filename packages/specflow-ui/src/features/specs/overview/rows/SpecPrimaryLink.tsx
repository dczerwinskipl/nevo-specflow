import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurrentSpecTarget } from '../model';

/** Stretches the title link over the whole row so the row is one target (see `InformationList`). */
export const specPrimaryLinkClassName =
  'pointer-events-auto static cursor-pointer whitespace-normal [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-focus-ring hover:text-accent-primary';

export type RenderSpecificationLink = (
  specId: string,
  children: ReactNode,
  ariaLabel: string,
) => ReactNode;

const isPlainPrimaryClick = (event: React.MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * The specification title as the row's primary target: the host's own link when it renders one
 * (router link), else an anchor that keeps modified clicks for the browser, else a button, else
 * plain text (a read-only preview).
 */
export function SpecPrimaryLink({
  specId,
  title,
  href,
  onOpenTarget,
  renderLink,
}: {
  readonly specId: string;
  readonly title: string;
  readonly href?: string;
  readonly onOpenTarget?: (target: CurrentSpecTarget) => void;
  readonly renderLink?: RenderSpecificationLink;
}) {
  const { t } = useTranslation();
  const label = t('specifications.openSpec', { title });
  const target: CurrentSpecTarget = { kind: 'specification', specId };
  const hosted = renderLink?.(specId, title, label);
  if (hosted) return hosted;
  if (href) {
    return (
      <a
        href={href}
        className={specPrimaryLinkClassName}
        data-focus-ring="delegated"
        aria-label={label}
        onClick={(event) => {
          if (!onOpenTarget || !isPlainPrimaryClick(event)) return;
          event.preventDefault();
          onOpenTarget(target);
        }}
      >
        {title}
      </a>
    );
  }
  if (onOpenTarget) {
    return (
      <button
        type="button"
        className={`${specPrimaryLinkClassName} text-left`}
        data-focus-ring="delegated"
        aria-label={label}
        onClick={() => onOpenTarget(target)}
      >
        {title}
      </button>
    );
  }
  return <>{title}</>;
}
