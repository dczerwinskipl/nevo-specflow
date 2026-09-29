export function isAriaInvalid(value) {
    return value === true || value === 'true' || value === 'grammar' || value === 'spelling';
}
/** Capture-only projection; runtime interaction styling remains native CSS state. */
export function textControlDesignState({ ariaInvalid, autoFocus, disabled, }) {
    if (disabled)
        return 'disabled';
    if (isAriaInvalid(ariaInvalid))
        return 'invalid';
    if (autoFocus)
        return 'focus';
    return 'default';
}
//# sourceMappingURL=textControlState.js.map