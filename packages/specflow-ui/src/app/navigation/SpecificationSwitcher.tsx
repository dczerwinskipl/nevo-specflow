import { LoadingPresentation } from '../loading/LoadingPresentation';
import { useId, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Icon,
  TextInput,
  Typography,
  Button,
  ScrollArea,
  Skeleton,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecsCollection } from '../../features/specs/overview/model';
import { useSpecificationSwitcher } from './useSpecificationSwitcher';
/** Primary input is touch: a focused text field would open the on-screen keyboard. */
const touchPrimaryInputQuery = '(pointer: coarse)';

export function SpecificationSwitcher({
  specId,
  title,
  displayKey,
  collection,
  identityAvailable,
  loading = false,
}: {
  specId: string;
  title: string;
  displayKey?: string;
  collection: SpecsCollection;
  identityAvailable: boolean;
  /** Navigation metadata has not settled yet: show a neutral placeholder, never a failure. */
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const { open, term, setTerm, pending, failure, query, entries, choose, committed, onOpenChange } =
    useSpecificationSwitcher({ specId, title, displayKey, collection, identityAvailable });
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const focusOption = (index: number) =>
    panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setLayer(trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
        }

        onOpenChange(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-description={t('applicationNavigation.changeSpecification')}
          className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <Typography
            as="span"
            variant="body-sm"
            className="mb-1 block pr-5 text-content-muted"
            data-specification-switcher-label
          >
            {t('applicationNavigation.currentSpecification')}
          </Typography>
          <div className="min-w-0" aria-busy={loading || undefined}>
            {loading ? (
              <Skeleton className="my-0.5 h-4 w-3/4" data-specification-switcher-loading />
            ) : (
              <Typography
                as="span"
                variant="title-sm"
                className="block whitespace-normal text-content-primary [overflow-wrap:anywhere]"
              >
                {title}
              </Typography>
            )}
            {displayKey ? (
              <Typography as="span" variant="body-sm" className="block text-content-secondary">
                {displayKey}
              </Typography>
            ) : null}
          </div>
          <Icon
            name={ChevronsUpDown}
            size="sm"
            className="absolute right-3 top-2"
            data-specification-switcher-icon
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        inert={!open}
        aria-hidden={!open}
        ref={panel}
        container={layer}
        motion="navigation"
        aria-label={t('applicationNavigation.changeSpecification')}
        className="w-80 p-3"
        style={layer ? { width: `${layer.clientWidth - 32}px` } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // Touch: opening must not raise the software keyboard over the list, so focus the panel
          // (announced as the dialog) and let the user tap the search field. Fine pointers get the
          // search field straight away.
          const target = window.matchMedia(touchPrimaryInputQuery).matches
            ? panel.current
            : search.current;
          target?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (committed.current) {
            document.querySelector<HTMLElement>('[data-workspace-active="true"] h1')?.focus();
          } else {
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        <TextInput
          ref={search}
          aria-label={t('applicationNavigation.searchSpecifications')}
          value={term}
          placeholder={t('applicationNavigation.searchSpecifications')}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && entries.length) {
              e.preventDefault();
              focusOption(e.key === 'ArrowDown' ? 0 : entries.length - 1);
            }
          }}
        />
        {query.isPending && !query.data ? (
          <LoadingPresentation
            shape="catalogue"
            label={t('specifications.loading')}
            fetching={query.fetchStatus === 'fetching'}
          />
        ) : null}
        {query.isError ? (
          <div className="py-2 text-body-sm" role="status">
            {t('applicationNavigation.catalogueUnavailable')}
            <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}
        <ScrollArea
          className="my-2 flex min-h-0 max-h-72 flex-col"
          tabIndex={-1}
          contentClassName="grid gap-1"
        >
          <div
            id={listId}
            role="listbox"
            aria-label={t('applicationNavigation.specifications')}
            className="grid gap-1"
            aria-busy={pending}
          >
            {entries.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === specId}
                disabled={pending}
                tabIndex={index === 0 ? 0 : -1}
                className="flex min-h-11 items-start gap-2 rounded-control px-2 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring aria-selected:bg-surface-selected"
                onClick={() => void choose(item.id)}
                onKeyDown={(event) => {
                  let next: number | undefined;
                  if (event.key === 'ArrowDown') {
                    next = (index + 1) % entries.length;
                  }

                  if (event.key === 'ArrowUp') {
                    next = (index - 1 + entries.length) % entries.length;
                  }

                  if (event.key === 'Home') {
                    next = 0;
                  }

                  if (event.key === 'End') {
                    next = entries.length - 1;
                  }

                  if (next !== undefined) {
                    event.preventDefault();
                    focusOption(next);
                  }
                }}
              >
                <span className="min-w-0 flex-1">
                  <Typography
                    as="span"
                    variant="title-sm"
                    className="block whitespace-normal text-content-primary [overflow-wrap:anywhere]"
                  >
                    {item.title}
                  </Typography>
                  {item.key ? (
                    <Typography
                      as="span"
                      variant="body-sm"
                      className="block text-content-secondary"
                    >
                      {item.key}
                    </Typography>
                  ) : null}
                  {item.id === specId ? (
                    <Typography
                      as="span"
                      variant="body-sm"
                      className="block text-content-secondary"
                    >
                      {t('applicationNavigation.selected')}
                    </Typography>
                  ) : null}
                </span>
                {item.id === specId ? <Icon name="check" size="sm" /> : null}
              </button>
            ))}
          </div>
        </ScrollArea>
        {!entries.length && !query.isPending ? (
          <Typography role="status" variant="body-sm">
            {t('applicationNavigation.noMatches')}
          </Typography>
        ) : null}
        {failure ? (
          <Typography role="alert" variant="body-sm">
            {t('applicationNavigation.navigationFailed')}
          </Typography>
        ) : null}
        <Link
          to="/"
          search={{ collection }}
          activeOptions={{ exact: true }}
          className="block rounded-control px-2 py-2 text-body-sm text-content-primary outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {t('applicationNavigation.browseSpecifications')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
