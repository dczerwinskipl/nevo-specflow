import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, InputGroup, TextInput } from '@nevo/ui';

/** The route's limit of a search text; longer text is not typed in at all. */
export const docsSearchMaxLength = 500;

/**
 * The search field of the tree pane (the Documents tree filter's anatomy). Escape or the clear
 * button empties it (`onClear`, which keeps focus in the field), which returns the pane to the tree.
 */
export const DocsSearchField = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (value: string) => void; onClear: () => void }
>(function DocsSearchField({ value, onChange, onClear }, ref) {
  const { t } = useTranslation();

  return (
    <div role="search" className="px-1">
      <InputGroup>
        <InputGroup.Addon>
          <Icon name="search" size="sm" />
        </InputGroup.Addon>
        <TextInput
          ref={ref}
          type="search"
          className="[&::-webkit-search-cancel-button]:appearance-none"
          aria-label={t('docs.search.label')}
          placeholder={t('docs.search.label')}
          maxLength={docsSearchMaxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value) {
              event.preventDefault();
              onClear();
            }
          }}
        />
        {value && (
          <InputGroup.Action>
            <IconButton
              aria-label={t('docs.search.clear')}
              icon="close"
              size="xs"
              onClick={onClear}
            />
          </InputGroup.Action>
        )}
      </InputGroup>
    </div>
  );
});
