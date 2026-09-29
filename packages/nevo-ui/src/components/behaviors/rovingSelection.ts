import { Children, Fragment, isValidElement, useCallback, useState, type ReactNode } from 'react';

type SelectableChildProps = {
  value?: unknown;
  disabled?: boolean;
  children?: ReactNode;
};

export function collectEnabledItemValues(children: ReactNode): string[] {
  const values: string[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    const childProps = child.props as SelectableChildProps;
    if (child.type === Fragment) {
      values.push(...collectEnabledItemValues(childProps.children));
      return;
    }

    if (typeof childProps.value === 'string' && !childProps.disabled) {
      values.push(childProps.value);
    }
  });

  return values;
}

export function resolveRovingTabStop(selectedValue: string, enabledValues: readonly string[]) {
  return enabledValues.includes(selectedValue) ? selectedValue : (enabledValues[0] ?? null);
}

export function findEnabledItems(
  currentItem: HTMLButtonElement,
  containerSelector: string,
  itemSelector: string,
) {
  const container = currentItem.closest<HTMLElement>(containerSelector);
  if (!container) return [];

  return Array.from(container.querySelectorAll<HTMLButtonElement>(itemSelector)).filter(
    (candidate) => !candidate.disabled && candidate.closest(containerSelector) === container,
  );
}

export function resolveRovingIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
  includeVerticalArrows = false,
) {
  if (itemCount <= 0 || currentIndex < 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;

  const direction =
    key === 'ArrowRight' || (includeVerticalArrows && key === 'ArrowDown')
      ? 1
      : key === 'ArrowLeft' || (includeVerticalArrows && key === 'ArrowUp')
        ? -1
        : 0;

  return direction === 0 ? null : (currentIndex + direction + itemCount) % itemCount;
}

export function useControllableSelection({
  controlledValue,
  defaultValue,
  onValueChange,
}: {
  controlledValue?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = controlledValue !== undefined;
  const selectedValue = (controlled ? controlledValue : uncontrolledValue) as string;

  const select = useCallback(
    (nextValue: string) => {
      if (nextValue === selectedValue) return;
      if (!controlled) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
    [controlled, onValueChange, selectedValue],
  );

  return { selectedValue, select };
}

