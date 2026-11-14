import { LoadingPresentation } from '../loading/LoadingPresentation';
import { useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  TextInput,
  Typography,
  Button,
  ScrollArea,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecsCollection } from '../../features/specs/overview/model';
import {
  ContextSwitcherOption,
  ContextSwitcherTrigger,
  contextSwitcherPopoverClassName,
  useListboxKeys,
} from '../../shared/context-switcher';
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
  const { focusOption, onOptionKeyDown } = useListboxKeys(panel);

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
        <ContextSwitcherTrigger
          ref={trigger}
          aria-description={t('applicationNavigation.changeSpecification')}
          label={t('applicationNavigation.currentSpecification')}
          name={title}
          details={displayKey ? [{ text: displayKey }] : []}
          loading={loading}
        />
      </PopoverTrigger>
      <PopoverContent
        inert={!open}
        aria-hidden={!open}
        ref={panel}
        container={layer}
        motion="navigation"
        aria-label={t('applicationNavigation.changeSpecification')}
        className={contextSwitcherPopoverClassName}
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
              focusOption(e.key === 'ArrowDown' ? 0 : -1);
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
              <ContextSwitcherOption
                key={item.id}
                name={item.title}
                details={item.key ? [{ text: item.key }] : []}
                selected={item.id === specId}
                disabled={pending}
                tabIndex={index === 0 ? 0 : -1}
                onClick={() => void choose(item.id)}
                onKeyDown={onOptionKeyDown}
              />
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
