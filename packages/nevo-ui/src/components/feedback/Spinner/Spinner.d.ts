import { type HTMLAttributes } from 'react';
export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    label?: string;
    size?: 'sm' | 'md';
}
export declare function Spinner({ className, label, size, ...props }: SpinnerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Spinner.d.ts.map