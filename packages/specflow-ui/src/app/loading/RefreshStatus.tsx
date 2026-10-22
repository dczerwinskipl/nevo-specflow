import { Icon } from '@nevo/ui';

/**
 * Icon-only "refreshing" indicator. The live region carries real text (visually hidden): a screen
 * reader announces a changed text node, but not a changed `aria-label` of an icon.
 */
export function RefreshStatus({
  active,
  label,
}: {
  readonly active: boolean;
  /** What is refreshing, already translated by the owner of the surface. */
  readonly label: string;
}) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center" role="status">
      {active ? (
        <>
          <Icon name="refresh" size="sm" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </>
      ) : null}
    </span>
  );
}
