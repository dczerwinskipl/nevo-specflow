import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CheckboxField,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from '@nevo/ui';
import { TreeSearchBar, TreeSearchField } from '../../../../shared/document-tree';
import { NO_TYPE, activeFilterCount, type TreeFilter } from './treeFilter';

/** A choice row: at least 40 px high where the pointer is coarse (touch). */
const choiceRow = 'pointer-coarse:min-h-10 pointer-coarse:items-center';

/**
 * Narrows the tree: a search by file name or path and a multiple choice of types ("No type" for
 * unclassified files). Compact, above the tree: the search takes the `TreeSearchBar` (not sticky),
 * the type choice is one small button with the number of chosen types, and the status row with
 * Clear filters appears under it only while a filter is on. Both are parts of the tree block.
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
    <>
      <TreeSearchBar>
        <TreeSearchField
          className="flex-1"
          label={t('documents.tree.filter.search')}
          value={filter.term}
          onChange={(term) => onChange({ ...filter, term })}
          onClear={() => onChange({ ...filter, term: '' })}
        />
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
      </TreeSearchBar>
      {showReset && active > 0 && (
        // The status on the text column, the button's edge on the filter button's edge (12 px).
        <div className="flex min-w-0 items-center justify-between gap-2 pr-3 pl-4">
          <span role="status" className="min-w-0 truncate text-body-sm text-content-muted">
            {status}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChange({ term: '', types: [] })}>
            {t('documents.tree.filter.reset', { count: active })}
          </Button>
        </div>
      )}
    </>
  );
}
