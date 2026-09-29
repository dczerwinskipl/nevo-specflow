interface ComparablePickerValue<T> {
  compare(other: T): number;
}

export function clampPickerValue<T extends ComparablePickerValue<T>>(
  value: T,
  minValue?: T | null,
  maxValue?: T | null,
): T {
  if (minValue && value.compare(minValue) < 0) return minValue;
  if (maxValue && value.compare(maxValue) > 0) return maxValue;
  return value;
}

