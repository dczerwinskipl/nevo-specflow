import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@nevo/ui';
import type {
  LimitWindow,
  MoneyUsage,
  Reading,
  TelemetrySnapshot,
  TokenUsage,
} from './sessionTelemetry';
import { isTelemetryVisible } from './sessionTelemetry';

/**
 * Low-emphasis "Session details" (full-session-screen-structure.md §7.2/§23): token usage, cost,
 * context occupancy and rate limits, placed last in Context — after Related Tasks — and never
 * competing visually with the three Primary-adjacent sections above it. Demo data today (see
 * `sessionTelemetry.ts`); the real contract is PR #107, not yet merged.
 *
 * Every dimension degrades independently: a `Reading` with `status: 'unavailable'` (or with no
 * meaningful sub-values even when `available`/`partial`) simply omits its own line, never a
 * placeholder/zero. When every dimension is unavailable this whole section renders nothing, the
 * same "missing data hides the section" rule the rest of `SessionContext` already follows.
 */
export function SessionTelemetrySection({ telemetry }: { telemetry?: TelemetrySnapshot }) {
  const { t, i18n } = useTranslation();

  if (!isTelemetryVisible(telemetry)) {
    return null;
  }

  const snapshot = telemetry!;
  const usageLine = formatTokenUsage(snapshot.usage.session, t, i18n.language);
  const costLine = formatCost(snapshot.cost.session, t, i18n.language);
  const contextLine = formatContextOccupancy(snapshot.context, t, i18n.language);
  const limitsLine = formatLimits(snapshot.limits, t, i18n.language);

  if (!usageLine && !costLine && !contextLine && !limitsLine) {
    return null;
  }

  return (
    <section className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Typography variant="section-label" className="text-content-muted">
          {t('sessions.context.sessionDetails.title')}
        </Typography>
        {snapshot.refresh.state === 'running' && (
          <Typography variant="label-sm" className="text-content-muted">
            {t('sessions.context.sessionDetails.refreshing')}
          </Typography>
        )}
      </div>
      <div className="grid gap-1 text-label-sm text-content-muted">
        {usageLine && <TelemetryLine content={usageLine.text} stale={usageLine.stale} />}
        {costLine && <TelemetryLine content={costLine.text} stale={costLine.stale} />}
        {contextLine && (
          <div className="grid gap-1">
            <TelemetryLine content={contextLine.text} stale={contextLine.stale} />
            <Progress
              size="compact"
              value={contextLine.occupied}
              max={contextLine.capacity}
              aria-label={t('sessions.context.sessionDetails.contextOccupancyAria')}
              className="max-w-40"
            />
          </div>
        )}
        {limitsLine && <TelemetryLine content={limitsLine.text} stale={limitsLine.stale} />}
      </div>
    </section>
  );
}

function TelemetryLine({ content, stale }: { content: string; stale: boolean }) {
  return (
    <p className="flex items-center gap-1.5">
      <span>{content}</span>
      {stale && <StaleMark />}
    </p>
  );
}

function StaleMark() {
  const { t } = useTranslation();

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge tone="neutral" size="compact" className="cursor-default">
            {t('sessions.context.sessionDetails.stale')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('sessions.context.sessionDetails.staleExplanation')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FormattedLine {
  text: string;
  stale: boolean;
}

function formatTokenUsage(
  reading: Reading<TokenUsage>,
  t: TFunction,
  locale: string,
): FormattedLine | undefined {
  if (reading.status === 'unavailable' || !reading.value) {
    return undefined;
  }

  const value = reading.value;
  const parts: string[] = [];
  // `key` varies per call, so it can't stay inside the typed `TFunction` key union; cast at this
  // one dynamic-key call site only (same pattern as `translateMessage` in `i18n/message.ts`).
  const translateDynamic = t as (key: string, options?: Record<string, string>) => string;
  const push = (amount: number | undefined, key: string) => {
    if (amount !== undefined) {
      parts.push(translateDynamic(key, { value: new Intl.NumberFormat(locale).format(amount) }));
    }
  };

  push(value.inputTokens, 'sessions.context.sessionDetails.inputTokens');
  push(value.outputTokens, 'sessions.context.sessionDetails.outputTokens');
  push(value.cacheReadTokens, 'sessions.context.sessionDetails.cacheReadTokens');
  push(value.cacheWriteTokens, 'sessions.context.sessionDetails.cacheWriteTokens');
  push(value.reasoningTokens, 'sessions.context.sessionDetails.reasoningTokens');

  if (parts.length === 0) {
    return undefined;
  }

  return { text: parts.join(' · '), stale: reading.freshness === 'stale' };
}

function formatCost(
  reading: Reading<MoneyUsage>,
  t: TFunction,
  locale: string,
): FormattedLine | undefined {
  if (reading.status === 'unavailable' || !reading.value) {
    return undefined;
  }

  const { amount, currency, basis, meaning } = reading.value;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return undefined;
  }

  const formattedAmount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numericAmount);

  const notes: string[] = [];
  if (basis === 'estimated') {
    notes.push(t('sessions.context.sessionDetails.costEstimatedSuffix'));
  }

  if (meaning === 'api-equivalent') {
    notes.push(t('sessions.context.sessionDetails.costApiEquivalentSuffix'));
  } else if (meaning === 'unknown') {
    notes.push(t('sessions.context.sessionDetails.costUnconfirmedSuffix'));
  }

  const text = notes.length > 0 ? `${formattedAmount} (${notes.join(', ')})` : formattedAmount;

  return { text, stale: reading.freshness === 'stale' };
}

function formatContextOccupancy(
  reading: TelemetrySnapshot['context'],
  t: TFunction,
  locale: string,
): (FormattedLine & { occupied: number; capacity: number }) | undefined {
  if (reading.status === 'unavailable' || !reading.value) {
    return undefined;
  }

  const { occupiedTokens, capacityTokens } = reading.value;
  if (
    occupiedTokens === undefined ||
    capacityTokens === undefined ||
    capacityTokens <= 0 ||
    occupiedTokens < 0
  ) {
    return undefined;
  }

  const percentage = Math.min(100, Math.round((occupiedTokens / capacityTokens) * 100));
  const text = t('sessions.context.sessionDetails.contextOccupancy', {
    value: new Intl.NumberFormat(locale).format(percentage),
  });

  return {
    text,
    stale: reading.freshness === 'stale',
    occupied: occupiedTokens,
    capacity: capacityTokens,
  };
}

/** `undefined` when a window's usage cannot be expressed as a percentage (missing `used`, or
 * missing `limit` for a non-`percent` unit) — such a window is still shown, just without a
 * computed ratio, and never sorted ahead of one that does have a real percentage. */
function limitWindowPercentage(window: LimitWindow): number | undefined {
  if (window.unit === 'percent') {
    const used = Number(window.used);

    return Number.isFinite(used) ? used : undefined;
  }

  if (window.used === undefined || window.limit === undefined) {
    return undefined;
  }

  const used = Number(window.used);
  const limit = Number(window.limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return (used / limit) * 100;
}

function formatWindowDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }

  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  return `${Math.round(seconds / 60)}m`;
}

function formatLimits(
  reading: TelemetrySnapshot['limits'],
  t: TFunction,
  locale: string,
): FormattedLine | undefined {
  if (reading.status === 'unavailable' || !reading.value?.windows.length) {
    return undefined;
  }

  const windows = reading.value.windows;
  const ranked = windows
    .map((window) => ({ window, percentage: limitWindowPercentage(window) }))
    .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));

  const shown = ranked.slice(0, 2);
  const extra = ranked.length - shown.length;

  const parts = shown.map(({ window, percentage }) => {
    const duration = formatWindowDuration(window.windowSeconds);
    const label = duration
      ? t('sessions.context.sessionDetails.rateLimitWindow', { window: duration })
      : window.windowId;
    const usedText =
      percentage !== undefined
        ? t('sessions.context.sessionDetails.rateLimitUsed', {
            value: new Intl.NumberFormat(locale).format(Math.round(percentage)),
          })
        : window.used !== undefined && window.limit !== undefined
          ? t('sessions.context.sessionDetails.rateLimitUsedOfLimit', {
              used: window.used,
              limit: window.limit,
              unit: window.unit,
            })
          : undefined;

    return usedText ? `${label}: ${usedText}` : label;
  });

  const text =
    extra > 0
      ? `${parts.join(' · ')} · ${t('sessions.context.sessionDetails.moreLimitWindows', { value: extra })}`
      : parts.join(' · ');

  return { text, stale: reading.freshness === 'stale' };
}
