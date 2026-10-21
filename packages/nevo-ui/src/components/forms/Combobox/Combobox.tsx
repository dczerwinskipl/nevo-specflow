import { useContext, useMemo, type AriaAttributes, type ReactNode, type Ref } from 'react';
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  Header as AriaHeader,
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Popover as AriaPopover,
  Text as AriaText,
  type Key,
} from 'react-aria-components';
import { designSlot } from '@nevo/figma-capture/metadata';
import { floatingContentClassName } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Spinner } from '../../feedback/Spinner';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useFieldControl } from '../Field';
import {
  optionDescriptionClassName,
  optionItemClassName,
  optionLabelWrappingClassName,
  optionMetaClassName,
} from '../shared/optionRecipes';
import { isAriaInvalid } from '../shared/textControlState';
import { textInputControlClassName } from '../TextInput/TextInput';
import { defaultComboboxFilter } from './filterOptions';

export interface ComboboxLabels {
  /** Accessible name of the chevron button. */
  showOptions: string;
  /** Shown when the filter matches nothing. */
  noResults: string;
  /** Shown (with a spinner) while `loading` is true and no option is available yet. */
  loading: string;
}

export const defaultComboboxLabels: ComboboxLabels = {
  showOptions: 'Show options',
  noResults: 'No results',
  loading: 'Loading',
};

export interface ComboboxProps {
  /** Selected option value (`ComboboxItem value`), or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /**
   * Local filter `(optionText, query) => boolean`. Default: Polish-safe case/diacritic-insensitive
   * "contains". Pass `false` when the options are already filtered by the owner (async lookup).
   */
  filter?: ((textValue: string, query: string) => boolean) | false;
  /** Async lookup: sets `aria-busy` and shows a spinner row while there are no options. */
  loading?: boolean;
  /** Controlled input text, for async lookup. */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /** Allow a value that is not one of the options. Default false. */
  allowsCustomValue?: boolean;
  /** `input` (default): open while typing, via the chevron or ArrowDown. `focus`: open on focus. */
  menuTrigger?: 'focus' | 'input' | 'manual';
  labels?: Partial<ComboboxLabels>;
  /** Accessible name when the Combobox is not inside a `Field` with a label. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  autoFocus?: boolean;
  /** Ref to the text input, for focus management without DOM queries. */
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  id?: string;
  name?: string;
  children: ReactNode;
}

export function Combobox({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  allowsCustomValue = false,
  autoFocus,
  children,
  className,
  defaultValue,
  disabled,
  filter,
  id,
  inputRef,
  inputValue,
  invalid = false,
  labels: labelOverrides,
  loading = false,
  menuTrigger = 'input',
  name,
  onInputChange,
  onValueChange,
  placeholder,
  value,
}: ComboboxProps) {
  const labels = { ...defaultComboboxLabels, ...labelOverrides };
  const field = useFieldControl({
    ariaDescribedBy,
    ariaInvalid: invalid ? true : ariaInvalid,
    ariaLabelledBy,
    disabled,
    id,
  });
  const resolvedInvalid = isAriaInvalid(field.ariaInvalid);
  const defaultFilter = useMemo(
    () => (filter === false ? () => true : (filter ?? defaultComboboxFilter)),
    [filter],
  );

  return (
    <AriaComboBox
      allowsCustomValue={allowsCustomValue}
      allowsEmptyCollection
      aria-busy={loading || undefined}
      aria-describedby={field.ariaDescribedBy}
      aria-label={ariaLabel}
      aria-labelledby={field.ariaLabelledBy}
      className={cn('relative flex w-full min-w-0 flex-col', className)}
      defaultFilter={defaultFilter}
      {...(value !== undefined
        ? { selectedKey: value }
        : { defaultSelectedKey: defaultValue ?? null })}
      {...(inputValue !== undefined ? { inputValue } : {})}
      formValue="key"
      isDisabled={field.disabled}
      isInvalid={resolvedInvalid}
      menuTrigger={menuTrigger}
      name={name}
      onInputChange={onInputChange}
      onSelectionChange={(key: Key | null) => onValueChange?.(key === null ? null : String(key))}
    >
      <div className="relative w-full min-w-0">
        <ComboboxInput
          autoFocus={autoFocus}
          id={field.id}
          inputRef={inputRef}
          insideField={field.insideField}
          placeholder={placeholder}
        />
        <AriaButton
          aria-label={labels.showOptions}
          className="absolute inset-y-0 right-0 inline-flex w-control-height-default cursor-pointer items-center justify-center rounded-control text-content-muted outline-none hover:text-content-primary disabled:cursor-not-allowed"
        >
          <Icon name="chevron-down" size="sm" />
        </AriaButton>
      </div>
      <AriaPopover
        className={cn(floatingContentClassName, 'flex w-max max-w-[calc(100vw-1rem)] flex-col')}
        containerPadding={8}
        offset={8}
        placement="bottom start"
      >
        <AriaListBox
          // The popover (`p-1`) sizes to its content; the list keeps it at least as wide as the input.
          className="scroll-area-viewport max-h-72 min-h-0 min-w-[calc(var(--trigger-width)-var(--spacing)*2)] flex-1 overflow-y-auto outline-none"
          renderEmptyState={() =>
            loading ? (
              <div
                className="flex items-center gap-2 px-control-padding-compact py-2 text-body-sm text-content-muted"
                role="status"
              >
                <Spinner size="sm" />
                {labels.loading}
              </div>
            ) : (
              <div
                className="px-control-padding-compact py-2 text-body-sm text-content-muted"
                role="status"
              >
                {labels.noResults}
              </div>
            )
          }
        >
          {children}
        </AriaListBox>
      </AriaPopover>
    </AriaComboBox>
  );
}

/**
 * The input also opens the list on click or tap (React Aria opens it only on typing, the chevron
 * and ArrowDown), so a touch user does not get a keyboard with no list.
 */
function ComboboxInput({
  autoFocus,
  id,
  inputRef,
  insideField,
  placeholder,
}: {
  autoFocus: boolean | undefined;
  id: string | undefined;
  inputRef: Ref<HTMLInputElement> | undefined;
  insideField: boolean;
  placeholder: string | undefined;
}) {
  const state = useContext(ComboBoxStateContext);
  return (
    <AriaInput
      autoFocus={autoFocus}
      className={cn(textInputControlClassName, 'pr-9 text-ellipsis placeholder:text-ellipsis')}
      id={id}
      onClick={() => {
        if (state && !state.isOpen) state.open(null, 'manual');
      }}
      placeholder={placeholder}
      ref={inputRef}
      {...(insideField ? designSlot('Field', 'control') : {})}
    />
  );
}

export interface ComboboxItemProps {
  /** Stable option value reported by `onValueChange`. */
  value: string;
  /** Plain text used for the input, filtering and the accessible name. Defaults to string children. */
  textValue?: string;
  /** Secondary line under the label. Wraps; stays readable when the option is unavailable. */
  description?: ReactNode;
  /** Trailing right-aligned slot (text or Badge). Never shown in the input. */
  meta?: ReactNode;
  /**
   * Not selectable; put the reason in `description`. v1 divergence from `SelectItem`:
   * the option is `aria-disabled` and skipped by arrow keys (react-aria ListBox cannot focus it).
   */
  unavailable?: boolean;
  className?: string;
  children: ReactNode;
}

export function ComboboxItem({
  children,
  className,
  description,
  meta,
  textValue,
  unavailable = false,
  value,
}: ComboboxItemProps) {
  const hasDescription = description !== undefined && description !== null && description !== false;
  const hasMeta = meta !== undefined && meta !== null && meta !== false;
  const structured = hasDescription || hasMeta;
  const keepsReasonReadable = structured && unavailable;

  return (
    <AriaListBoxItem
      className={cn(
        optionItemClassName({ keepsReasonReadable, unavailable }),
        'data-[focused]:bg-surface-hover data-[focused]:text-content-primary data-[hovered]:bg-surface-hover data-[hovered]:text-content-primary',
        className,
      )}
      data-unavailable={unavailable ? '' : undefined}
      id={value}
      isDisabled={unavailable}
      textValue={textValue ?? (typeof children === 'string' ? children : undefined)}
    >
      {({ isSelected }) => (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('flex min-w-0', keepsReasonReadable && 'opacity-50')}>
              <AriaText
                className={cn(
                  optionLabelWrappingClassName,
                  'text-body-sm',
                  !structured && 'flex-1',
                )}
                slot="label"
              >
                {children}
              </AriaText>
            </span>
            {hasDescription ? (
              <AriaText
                className={cn(optionDescriptionClassName, 'text-body-sm')}
                data-combobox-item-part="description"
                slot="description"
              >
                {description}
              </AriaText>
            ) : null}
          </span>
          {hasMeta ? (
            <span
              className={cn(optionMetaClassName, keepsReasonReadable && 'opacity-50')}
              data-combobox-item-part="meta"
            >
              {meta}
            </span>
          ) : null}
          {isSelected ? (
            <span className="absolute right-control-padding-compact inline-flex text-content-primary">
              <Icon name="check" size="sm" />
            </span>
          ) : null}
        </>
      )}
    </AriaListBoxItem>
  );
}

export interface ComboboxGroupProps {
  label: ReactNode;
  children: ReactNode;
}

export function ComboboxGroup({ children, label }: ComboboxGroupProps) {
  return (
    <AriaListBoxSection>
      <AriaHeader>
        <Typography
          as="span"
          className="block px-2 pb-1 pt-2 text-content-muted"
          variant="section-label"
        >
          {label}
        </Typography>
      </AriaHeader>
      {children}
    </AriaListBoxSection>
  );
}
