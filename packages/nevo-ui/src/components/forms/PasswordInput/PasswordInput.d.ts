import { type TextInputProps } from '../TextInput';
export interface PasswordInputLabels {
    hide: string;
    show: string;
}
export interface PasswordInputProps extends Omit<TextInputProps, 'type'> {
    labels?: Partial<PasswordInputLabels>;
    wrapperClassName?: string;
}
export declare const PasswordInput: import("react").ForwardRefExoticComponent<PasswordInputProps & import("react").RefAttributes<HTMLInputElement>>;
//# sourceMappingURL=PasswordInput.d.ts.map