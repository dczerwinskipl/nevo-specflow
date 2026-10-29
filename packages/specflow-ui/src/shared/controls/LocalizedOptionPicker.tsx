import { useTranslation } from 'react-i18next';
import { OptionPicker, type OptionPickerProps } from '@nevo/ui';

export type { OptionPickerItem as OptionSelectItem } from '@nevo/ui';

/**
 * The design-system `OptionPicker` with the texts of its searchable list taken from the common
 * catalogue. The Select-or-Combobox rule itself belongs to the design system, not to the product.
 */
export function LocalizedOptionPicker(props: Omit<OptionPickerProps, 'labels'>) {
  const { t } = useTranslation();

  return (
    <OptionPicker
      {...props}
      labels={{
        showOptions: t('common.options.show'),
        noResults: t('common.options.noResults'),
        loading: t('common.options.loading'),
      }}
    />
  );
}
