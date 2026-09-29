import { type NumberFieldProps as AriaNumberFieldProps } from 'react-aria-components';
import type { AriaAttributes } from 'react';
export interface NumberInputProps extends Omit<AriaNumberFieldProps, 'children' | 'className' | 'isDisabled' | 'isInvalid' | 'isReadOnly' | 'isRequired' | 'minValue' | 'maxValue'> {
    className?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    disabled?: boolean;
    invalid?: boolean;
    maxValue?: number;
    minValue?: number;
    readOnly?: boolean;
    required?: boolean;
    showSteppers?: boolean;
}
export declare function NumberInput({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, disabled, id, invalid, maxValue, minValue, readOnly, required, showSteppers, ...props }: NumberInputProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=NumberInput.d.ts.map