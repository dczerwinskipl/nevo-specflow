import type { AriaAttributes } from 'react';
export type TextControlDesignState = 'default' | 'focus' | 'disabled' | 'invalid';
export declare function isAriaInvalid(value: AriaAttributes['aria-invalid']): value is true | "true" | "grammar" | "spelling";
/** Capture-only projection; runtime interaction styling remains native CSS state. */
export declare function textControlDesignState({ ariaInvalid, autoFocus, disabled, }: {
    ariaInvalid?: AriaAttributes['aria-invalid'];
    autoFocus?: boolean;
    disabled?: boolean;
}): TextControlDesignState;
//# sourceMappingURL=textControlState.d.ts.map