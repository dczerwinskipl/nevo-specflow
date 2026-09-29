import { useCallback, useEffect, useRef, useState } from 'react';

export interface PickerDraftStateOptions<T> {
  defaultOpen?: boolean;
  defaultValue?: T | null;
  fallbackValue: T;
  onChange?: (value: T | null) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  value?: T | null;
}

export function usePickerDraftState<T>({
  defaultOpen = false,
  defaultValue,
  fallbackValue,
  onChange,
  onOpenChange,
  open,
  value,
}: PickerDraftStateOptions<T>) {
  const initialOpen = open ?? defaultOpen;
  const initialCommittedValue = value !== undefined ? value : (defaultValue ?? null);

  const [uncontrolledValue, setUncontrolledValue] = useState<T | null>(defaultValue ?? null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [draftValue, setDraftValue] = useState<T | null>(() =>
    initialOpen ? (initialCommittedValue ?? fallbackValue) : initialCommittedValue,
  );

  const committedValue = value !== undefined ? value : uncontrolledValue;
  const resolvedOpen = open ?? uncontrolledOpen;
  const wasOpen = useRef(resolvedOpen);
  const previousControlledValue = useRef(value);

  useEffect(() => {
    if (value === undefined) {
      previousControlledValue.current = value;
      return;
    }

    if (Object.is(previousControlledValue.current, value)) return;

    previousControlledValue.current = value;
    setDraftValue(value ?? (resolvedOpen ? fallbackValue : null));
  }, [fallbackValue, resolvedOpen, value]);

  useEffect(() => {
    if (resolvedOpen === wasOpen.current) return;

    setDraftValue(resolvedOpen ? (committedValue ?? fallbackValue) : committedValue);
    wasOpen.current = resolvedOpen;
  }, [committedValue, fallbackValue, resolvedOpen]);

  const commitValue = useCallback(
    (nextValue: T | null) => {
      if (value === undefined) setUncontrolledValue(nextValue);
      onChange?.(nextValue);
    },
    [onChange, value],
  );

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      setDraftValue(nextOpen ? (committedValue ?? fallbackValue) : committedValue);

      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [committedValue, fallbackValue, onOpenChange, open],
  );

  const cancel = useCallback(() => {
    setDraftValue(committedValue);
    if (open === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false);
  }, [committedValue, onOpenChange, open]);

  const done = useCallback(() => {
    commitValue(draftValue);
    if (open === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false);
  }, [commitValue, draftValue, onOpenChange, open]);

  return {
    cancel,
    commitValue,
    committedValue,
    done,
    draftValue,
    resolvedOpen,
    setDraftValue,
    setOpen,
  };
}
