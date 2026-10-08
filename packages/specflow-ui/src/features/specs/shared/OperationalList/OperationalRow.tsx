import { Icon, InformationList, Typography, cn } from '@nevo/ui';
import type { OperationalRowProps, SemanticSupporting } from './OperationalRow.types';

function isSemanticSupporting(value: unknown): value is SemanticSupporting {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof (value as SemanticSupporting).text === 'string'
  );
}

export function OperationalRow({
  primary,
  primaryHref,
  onPrimaryClick,
  primaryAriaLabel,
  compactFacts = [],
  supporting,
  trailing,
  leading,
  marker,
  interactive = false,
  selected = false,
  className,
  dataAttributes = {},
}: OperationalRowProps) {
  const isRowInteractive = interactive || Boolean(primaryHref) || Boolean(onPrimaryClick);

  const primaryContent = primaryHref ? (
    <a
      href={primaryHref}
      data-focus-ring="delegated"
      className="pointer-events-auto static cursor-pointer truncate outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-focus-ring hover:text-accent-primary"
      aria-label={primaryAriaLabel}
      onClick={onPrimaryClick}
    >
      {primary}
    </a>
  ) : onPrimaryClick ? (
    <button
      type="button"
      data-focus-ring="delegated"
      className="pointer-events-auto static block w-full truncate text-left cursor-pointer outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-focus-ring hover:text-accent-primary"
      aria-label={primaryAriaLabel}
      onClick={onPrimaryClick}
    >
      {primary}
    </button>
  ) : (
    <span className="truncate">{primary}</span>
  );

  let supportingContent: React.ReactNode = null;
  if (supporting) {
    if (isSemanticSupporting(supporting)) {
      supportingContent = (
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-1.5 truncate text-content-secondary',
            supporting.tone === 'attention' && 'text-status-attention font-medium',
            supporting.tone === 'danger' && 'text-status-danger font-medium',
            supporting.tone === 'success' && 'text-status-success',
            supporting.tone === 'info' && 'text-accent-primary font-medium',
            supporting.textClassName,
          )}
        >
          {supporting.icon && (
            <span className="flex size-4 shrink-0 items-center justify-center">
              <Icon
                name={supporting.icon}
                size="sm"
                className={cn('shrink-0', supporting.iconClassName)}
              />
            </span>
          )}
          <span className="truncate">{supporting.text}</span>
        </span>
      );
    } else {
      supportingContent = <span className="truncate text-content-secondary">{supporting}</span>;
    }
  }

  // Schema fact layout:
  // 1 compact fact: [calc(var(--spacing)*18)_minmax(0,1fr)]
  // 2 compact facts: [calc(var(--spacing)*18)_calc(var(--spacing)*24)_minmax(0,1fr)]
  const fact1 = compactFacts[0];
  const fact2 = compactFacts[1];
  const hasTwoFacts = compactFacts.length === 2;

  const secondaryGridClass = hasTwoFacts
    ? 'grid min-w-0 grid-cols-1 gap-y-0.5 sm:grid-cols-[calc(var(--spacing)*18)_calc(var(--spacing)*24)_minmax(0,1fr)] sm:items-baseline sm:gap-x-2'
    : 'grid min-w-0 grid-cols-1 gap-y-0.5 sm:grid-cols-[calc(var(--spacing)*18)_minmax(0,1fr)] sm:items-baseline sm:gap-x-2';

  const renderFact = (fact: (typeof compactFacts)[number] | undefined) => {
    if (fact === undefined) return null;
    const text = typeof fact === 'string' ? fact : fact.text;
    const isMono = typeof fact === 'object' && fact.mono;
    return (
      <span className={cn('truncate text-content-secondary', isMono && 'font-mono')}>{text}</span>
    );
  };

  return (
    <InformationList.Item
      interactive={isRowInteractive}
      selected={selected}
      className={className}
      {...dataAttributes}
    >
      {leading ? <InformationList.Leading>{leading}</InformationList.Leading> : null}
      {marker ? (
        <div className="flex size-4 shrink-0 items-center justify-center">
          {marker === true ? <span aria-hidden="true" className="size-4 shrink-0" /> : marker}
        </div>
      ) : null}

      <InformationList.Content>
        {/* Line 1: Primary title single line */}
        <Typography as="h3" variant="title-sm" className="flex min-w-0 text-content-primary">
          {primaryContent}
        </Typography>

        {/* Line 2: Compact facts + supporting */}
        {compactFacts.length > 0 || supportingContent ? (
          <Typography
            as="div"
            variant="body-sm"
            className={cn(secondaryGridClass, 'text-content-muted')}
          >
            {renderFact(fact1)}
            {renderFact(fact2)}
            {supportingContent && (
              <div className={cn('min-w-0 truncate', hasTwoFacts ? 'col-span-1' : 'col-span-1')}>
                {supportingContent}
              </div>
            )}
          </Typography>
        ) : null}
      </InformationList.Content>

      {trailing ? <InformationList.Trailing>{trailing}</InformationList.Trailing> : null}
    </InformationList.Item>
  );
}
