import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CheckboxField,
  Icon,
  IconButton,
  InputGroup,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  TextInput,
} from '@nevo/ui';

/** A choice row: at least 40 px high where the pointer is coarse (touch). */
const choiceRow = 'pointer-coarse:min-h-10 pointer-coarse:items-center';
import { NO_TYPE, activeFilterCount, type TreeFilter } from './treeFilter';

/**
 * Narrows the tree: a search by file name or path and a multiple choice of types ("No type" for
 * unclassified files). Compact, above the tree: the search takes the row, the type choice is one
 * small button with the number of chosen types, and Clear filters appears only while a filter is on.
 */
export function TreeFilterBar({
  filter,
  types,
  typeTitle,
  showReset = true,
  status,
  onChange,
}: {
  filter: TreeFilter;
  /** False while the no-results state offers the reset itself. */
  showReset?: boolean;
  /** How much of the tree a filter shows ("Showing 1 of 7 files"). */
  status?: string;
  /** The type ids present in the tree (`NO_TYPE` for unclassified files). */
  types: readonly string[];
  typeTitle: (typeId: string) => string;
  onChange: (filter: TreeFilter) => void;
}) {
  const { t } = useTranslation();
  const groupId = useId();
  const active = activeFilterCount(filter);
  const toggle = (type: string, on: boolean) =>
    onChange({
      ...filter,
      types: on ? [...filter.types, type] : filter.types.filter((value) => value !== type),
    });
  return (
    <div className="grid gap-1 px-1">
      <div className="flex min-w-0 items-center gap-1">
        <InputGroup className="min-w-0 flex-1">
          <InputGroup.Addon>
            <Icon name="search" size="sm" />
          </InputGroup.Addon>
          <TextInput
            type="search"
            // The field has its own clear action; the browser's would be a second one.
            className="[&::-webkit-search-cancel-button]:appearance-none"
            aria-label={t('documents.tree.filter.search')}
            placeholder={t('documents.tree.filter.search')}
            value={filter.term}
            onChange={(event) => onChange({ ...filter, term: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && filter.term) {
                event.preventDefault();
                onChange({ ...filter, term: '' });
              }
            }}
          />
          {filter.term && (
            <InputGroup.Action>
              <IconButton
                aria-label={t('documents.tree.filter.clearSearch')}
                icon="close"
                size="xs"
                onClick={() => onChange({ ...filter, term: '' })}
              />
            </InputGroup.Action>
          )}
        </InputGroup>
        {types.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              {filter.types.length ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon="filter"
                  aria-label={t('documents.tree.filter.typesActive', {
                    count: filter.types.length,
                  })}
                >
                  {String(filter.types.length)}
                </Button>
              ) : (
                <IconButton
                  aria-label={t('documents.tree.filter.types')}
                  icon="filter"
                  size="sm"
                  variant="ghost"
                />
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-3">
              <fieldset className="m-0 grid gap-2 border-0 p-0" aria-labelledby={groupId}>
                <legend id={groupId} className="mb-1 p-0 text-label-sm text-content-primary">
                  {t('documents.tree.filter.types')}
                </legend>
                {types
                  .filter((type) => type !== NO_TYPE)
                  .map((type) => (
                    <CheckboxField
                      key={type}
                      fieldClassName={choiceRow}
                      label={typeTitle(type)}
                      checked={filter.types.includes(type)}
                      onCheckedChange={(checked) => toggle(type, checked === true)}
                    />
                  ))}
                {types.includes(NO_TYPE) && (
                  <>
                    <Separator />
                    <CheckboxField
                      fieldClassName={choiceRow}
                      label={t('documents.tree.filter.noType')}
                      checked={filter.types.includes(NO_TYPE)}
                      onCheckedChange={(checked) => toggle(NO_TYPE, checked === true)}
                    />
                  </>
                )}
              </fieldset>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {showReset && active > 0 && (
        <div className="flex min-w-0 items-center justify-between gap-2 pl-2">
          <span role="status" className="min-w-0 truncate text-body-sm text-content-muted">
            {status}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChange({ term: '', types: [] })}>
            {t('documents.tree.filter.reset', { count: active })}
          </Button>
        </div>
      )}
    </div>
  );
}
