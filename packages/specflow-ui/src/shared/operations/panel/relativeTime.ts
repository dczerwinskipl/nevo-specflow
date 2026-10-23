import { useSyncExternalStore } from 'react';

/** One shared clock for every relative time on screen: a tick every 30 s while anything listens. */
export const relativeTimeTickMs = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, relativeTimeTickMs);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time, refreshed by the shared ticker (one interval no matter how many rows). */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}

/** Whole minutes between `iso` and `at` (never negative); undefined when `iso` is not a date. */
export function minutesSince(iso: string, at: number): number | undefined {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? undefined : Math.max(0, Math.floor((at - time) / 60_000));
}

/** "just now", "5 minutes ago", "2 hours ago" in the language of the UI; undefined for a bad date. */
export function formatRelativeTime(iso: string, at: number, locale: string): string | undefined {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return undefined;
  const seconds = Math.round((time - at) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return formatter.format(0, 'second');
  if (magnitude < 45 * 60) return formatter.format(Math.round(seconds / 60), 'minute');
  if (magnitude < 22 * 3600) return formatter.format(Math.round(seconds / 3600), 'hour');
  return formatter.format(Math.round(seconds / 86_400), 'day');
}
