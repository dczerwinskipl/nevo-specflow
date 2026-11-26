import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxField,
  Collapsible,
  Icon,
  IconButton,
  InputGroup,
  OPTION_PICKER_SELECT_MAX,
  TextInput,
  Typography,
} from '@nevo/ui';

/** One thing the picker offers: a Task, a document. */
export interface PickerItem {
  readonly id: string;
  /** What people call it (a Task's title, a document's title), never a technical id. */
  readonly title: string;
  /** A quiet second line of an available item (its status, its file name). */
  readonly description?: ReactNode;
  /** Text matched by the search besides the title (an id, a file name). */
  readonly searchText?: string;
  /**
   * Why it cannot be chosen, in its own words ("Already a dependency", "Cancelled; it would never
   * be done"). Such items are listed apart, under the collapsed unavailable group.
   */
  readonly unavailable?: string;
  /** It is in the list already (shown checked, under the unavailable group). */
  readonly added?: boolean;
}

export interface ItemPickerLabels {
  /** The group of choosable items: "Available tasks". */
  readonly available: string;
  /** The collapsed group of the others: "Unavailable tasks". */
  readonly unavailable: string;
  /** Nothing can be chosen (every item is unavailable): "No task can be added." */
  readonly noneAvailable: string;
  /** The search field's name: "Search tasks". */
  readonly search?: string;
}

/** Normalised for matching: case and accents do not matter. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * The checklist of the dialogs that add things to a list (dependencies, context documents, a new
 * Task's dependencies): the items that can be chosen first, under "Available", each by its title;
 * the ones that cannot, each with its concrete reason, in a collapsed "Unavailable" group after
 * them. A list longer than a Select's (`OPTION_PICKER_SELECT_MAX`) gets a search field that filters
 * both groups. The caller owns what is picked and names the count on its primary action ("Add 2
 * dependencies").
 *
 * `query` and `onQueryChange` hand the search to the caller (a search the server answers): the
 * items are then shown as given, and the field is always there.
 */
export function ItemPicker({
  items,
  picked,
  onToggle,
  labels,
  query: ownerQuery,
  onQueryChange,
  status,
}: {
  readonly items: readonly PickerItem[];
  readonly picked: readonly string[];
  readonly onToggle: (id: string, checked: boolean) => void;
  readonly labels: ItemPickerLabels;
  readonly query?: string;
  readonly onQueryChange?: (query: string) => void;
  /** What the search is doing (searching, failed, no results), under the field. */
  readonly status?: ReactNode;
}) {
  const { t } = useTranslation();
  const availableId = useId();
  const [localQuery, setLocalQuery] = useState('');
  const remote = onQueryChange !== undefined;
  const query = remote ? (ownerQuery ?? '') : localQuery;
  const setQuery = remote ? onQueryChange : setLocalQuery;
  const searchable =
    labels.search !== undefined && (remote || items.length > OPTION_PICKER_SELECT_MAX);
  const term = fold(query.trim());
  const shown =
    remote || term === ''
      ? items
      : items.filter((item) => fold(`${item.title} ${item.searchText ?? ''}`).includes(term));
  const available = shown.filter((item) => item.unavailable === undefined);
  const unavailable = shown.filter((item) => item.unavailable !== undefined);
  const nothingToShow = shown.length === 0;

  return (
    <div className="grid min-w-0 gap-4" data-item-picker="">
      {searchable ? (
        <div className="grid gap-2">
          <InputGroup>
            <InputGroup.Addon>
              <Icon name="search" size="sm" />
            </InputGroup.Addon>
            <TextInput
              type="search"
              className="[&::-webkit-search-cancel-button]:appearance-none"
              aria-label={labels.search}
              placeholder={labels.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <InputGroup.Action>
                <IconButton
                  aria-label={t('common.clearSearch')}
                  icon="close"
                  size="xs"
                  onClick={() => setQuery('')}
                />
              </InputGroup.Action>
            ) : null}
          </InputGroup>
          {status}
        </div>
      ) : (
        status
      )}
      {nothingToShow ? (
        term !== '' && !remote ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('taskAuthoring.picker.noMatches')}
          </Typography>
        ) : null
      ) : (
        <>
          <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" aria-labelledby={availableId}>
            <Typography
              as="p"
              variant="label-sm"
              id={availableId}
              className="flex items-baseline gap-2 text-content-primary"
            >
              {labels.available}
              <span className="font-normal text-content-muted">{available.length}</span>
            </Typography>
            {available.length === 0 ? (
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {labels.noneAvailable}
              </Typography>
            ) : (
              available.map((item) => (
                <CheckboxField
                  key={item.id}
                  label={item.title}
                  {...(item.description ? { description: item.description } : {})}
                  checked={picked.includes(item.id)}
                  onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                />
              ))
            )}
          </fieldset>
          {unavailable.length > 0 ? (
            <Collapsible className="-ml-control-padding-compact" data-picker-unavailable="">
              <Collapsible.Trigger>
                <span className="flex items-baseline gap-2">
                  {labels.unavailable}
                  <span className="text-content-muted">{unavailable.length}</span>
                </span>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div className="grid gap-3 pt-2 pl-control-padding-compact">
                  {unavailable.map((item) => (
                    <CheckboxField
                      key={item.id}
                      label={item.title}
                      description={item.unavailable}
                      checked={item.added === true}
                      disabled
                    />
                  ))}
                </div>
              </Collapsible.Content>
            </Collapsible>
          ) : null}
        </>
      )}
    </div>
  );
}
