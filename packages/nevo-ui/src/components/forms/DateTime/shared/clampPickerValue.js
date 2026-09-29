export function clampPickerValue(value, minValue, maxValue) {
    if (minValue && value.compare(minValue) < 0)
        return minValue;
    if (maxValue && value.compare(maxValue) > 0)
        return maxValue;
    return value;
}
//# sourceMappingURL=clampPickerValue.js.map