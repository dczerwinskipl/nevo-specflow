import type { MutableRefObject, ReactNode } from 'react';
import { Combobox, ComboboxItem, type ComboboxLabels } from '../Combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../Select';

export interface OptionPickerItem {
  value: string;
  /** Plain text used for filtering and as the accessible name of the chosen option. */
  textValue: string;
  /** A function receives `wraps`: true in the searchable list, whose options wrap instead of truncating. */
  label: ReactNode | ((wraps: boolean) => ReactNode);
  description?: ReactNode;
  meta?: ReactNode;
  /** Reachable and readable but not selectable; put the reason in `description`. */
  unavailable?: boolean;
}

/**
 * Up to this many options a closed `Select` is the right control; from the next one on a
 * searchable `Combobox` is (see "Select vs Combobox" in the component guidelines).
 */
export const OPTION_PICKER_SELECT_MAX = 8;

export interface OptionPickerProps {
  items: readonly OptionPickerItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Texts of the searchable list; the owner localises them. */
  labels: ComboboxLabels;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Receives the focusable control (select trigger or combobox input), e.g. to focus an error. */
  controlRef?: MutableRefObject<HTMLElement | null>;
}

const labelOf = (item: OptionPickerItem, wraps: boolean) =>
  typeof item.label === 'function' ? item.label(wraps) : item.label;

/**
 * Choose one option from a list the owner cannot bound in advance: a short list stays a `Select`,
 * a longer one becomes a searchable `Combobox`, with the same item anatomy either way. Inside a
 * `Field` both are labelled by `Field.Label`.
 */
export function OptionPicker({
  items,
  value,
  onValueChange,
  labels,
  placeholder,
  invalid,
  disabled,
  controlRef,
}: OptionPickerProps) {
  if (items.length > OPTION_PICKER_SELECT_MAX) {
    return (
      <Combobox
        inputRef={(node) => {
          if (controlRef) {
            controlRef.current = node;
          }
        }}
        value={value || null}
        invalid={invalid}
        disabled={disabled}
        placeholder={placeholder}
        labels={labels}
        onValueChange={(next) => {
          if (next !== null) {
            onValueChange(next);
          }
        }}
      >
        {items.map((item) => (
          <ComboboxItem
            key={item.value}
            value={item.value}
            textValue={item.textValue}
            description={item.description}
            meta={item.meta}
            unavailable={item.unavailable}
          >
            {labelOf(item, true)}
          </ComboboxItem>
        ))}
      </Combobox>
    );
  }

  return (
    <Select value={value} invalid={invalid} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger
        ref={(node) => {
          if (controlRef) {
            controlRef.current = node;
          }
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            textValue={item.textValue}
            description={item.description}
            meta={item.meta}
            unavailable={item.unavailable}
          >
            {labelOf(item, false)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
