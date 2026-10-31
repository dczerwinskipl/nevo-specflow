import type { TFunction } from 'i18next';
import { useId, type CSSProperties } from 'react';
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
 *
 * Visual redesign (live review — "Statystyki to jedna czcionka i goły tekst"): every limit-type
 * value (context occupancy, each rate-limit window) now renders through the DS `Progress` bar
 * with a label/value pair, not bare joined sentences. Plain counts (token usage, cost) keep a
 * sentence but gain the same label/value Typography split as the bar rows, so the whole section
 * reads as one consistent hierarchy instead of one undifferentiated font.
 */
export function SessionTelemetrySection({ telemetry }: { telemetry?: TelemetrySnapshot }) {
  const { t, i18n } = useTranslation();

  if (!isTelemetryVisible(telemetry)) {
    return null;
  }

  const snapshot = telemetry!;
  const usageLine = formatTokenUsage(snapshot.usage.session, t, i18n.language);
  const costLine = formatCost(snapshot.cost.session, t, i18n.language);
  const contextStat = formatContextOccupancy(snapshot.context);
  const limits = formatLimitWindows(snapshot.limits, t, i18n.language);

  if (!usageLine && !costLine && !contextStat && !limits) {
    return null;
  }

  return (
    <section className="grid gap-2">
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
      <div className="grid gap-3">
        {usageLine && (
          <StatRow
            label={t('sessions.context.sessionDetails.usageLabel')}
            value={usageLine.text}
            stale={usageLine.stale}
          />
        )}
        {costLine && (
          <StatRow
            label={t('sessions.context.sessionDetails.costLabel')}
            value={costLine.text}
            stale={costLine.stale}
          />
        )}
        {contextStat && (
          <LimitRow
            label={t('sessions.context.sessionDetails.contextOccupancyAria')}
            percentage={contextStat.percentage}
            valueText={t('sessions.context.sessionDetails.percentValue', {
              value: new Intl.NumberFormat(i18n.language).format(contextStat.percentage),
            })}
            stale={contextStat.stale}
          />
        )}
        {limits?.windows.map((window) => (
          <LimitRow
            key={window.id}
            label={window.label}
            percentage={window.percentage}
            valueText={window.valueText}
            stale={window.stale}
          />
        ))}
        {limits && limits.extra > 0 && (
          <Typography variant="body-sm" className="text-content-muted">
            {t('sessions.context.sessionDetails.moreLimitWindows', { value: limits.extra })}
          </Typography>
        )}
      </div>
    </section>
  );
}

/** A plain count/sentence dimension (token usage, cost): a muted `label-sm` caption over the
 * `body-sm` value, the same label/value split every bar row below also uses, instead of one
 * undifferentiated sentence. */
function StatRow({ label, value, stale }: { label: string; value: string; stale: boolean }) {
  return (
    <div className="grid gap-0.5">
      <Typography variant="label-sm" className="text-content-muted">
        {label}
      </Typography>
      <div className="flex items-center gap-1.5">
        <Typography variant="body-sm" className="text-content-secondary">
          {value}
        </Typography>
        {stale && <StaleMark />}
      </div>
    </div>
  );
}

/**
 * A limit-type value (context-window occupancy, a rate-limit window): the canonical DS `Progress`
 * composition (label + bar + value), the same grammar `Progress.stories.tsx`'s `WithMetadata`
 * story already establishes for this component, with the fill colour stepped by usage threshold
 * (see `progressTone`). Falls back to a plain value line — never a bar — when no percentage can
 * be honestly computed (graceful degradation; see `limitWindowPercentage`).
 */
function LimitRow({
  label,
  percentage,
  valueText,
  stale,
}: {
  label: string;
  percentage?: number;
  valueText?: string;
  stale: boolean;
}) {
  const labelId = useId();

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5">
        <Typography id={labelId} variant="label-sm" className="text-content-muted">
          {label}
        </Typography>
        {stale && <StaleMark />}
      </div>
      {percentage !== undefined ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Progress
            size="compact"
            value={percentage}
            max={100}
            aria-labelledby={labelId}
            style={progressFillStyle(progressTone(percentage))}
          />
          {valueText && (
            <Typography variant="code-md" className="text-content-muted">
              {valueText}
            </Typography>
          )}
        </div>
      ) : (
        valueText && (
          <Typography variant="body-sm" className="text-content-secondary">
            {valueText}
          </Typography>
        )
      )}
    </div>
  );
}

/**
 * Usage threshold tiers (owner-decision default — see module header: `Reading`/`LimitWindow` have
 * no server-provided tone/threshold field today, so this is a hardcoded client-side cutoff, not a
 * value read from the telemetry contract. Revisit once PR #107 or a successor documents one).
 */
type ProgressTone = 'default' | 'attention' | 'danger';

function progressTone(percentage: number): ProgressTone {
  if (percentage >= 90) {
    return 'danger';
  }

  if (percentage >= 70) {
    return 'attention';
  }

  return 'default';
}

/** `Progress`'s fill colour is the themeable `--color-progress-fill` CSS custom property
 * (`design-system.css`); overriding it on this one instance reuses the DS's existing
 * warning/danger convention (`StatusIndicator`'s `bg-status-attention`/`bg-status-danger`) without
 * modifying the shared `Progress` component, which has no `tone`/variant prop of its own. */
function progressFillStyle(tone: ProgressTone): CSSProperties | undefined {
  if (tone === 'default') {
    return undefined;
  }

  return {
    '--color-progress-fill':
      tone === 'danger' ? 'var(--color-status-danger)' : 'var(--color-status-attention)',
  } as CSSProperties;
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
): { percentage: number; stale: boolean } | undefined {
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

  return { percentage, stale: reading.freshness === 'stale' };
}

/** `undefined` when a window's usage cannot be expressed as a percentage (missing `used`, or
 * missing `limit` for a non-`percent` unit) — such a window is still shown, just without a
 * computed ratio (and therefore without a `Progress` bar — never a fake/zero one), and never
 * sorted ahead of one that does have a real percentage. */
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

interface LimitRowData {
  id: string;
  label: string;
  percentage?: number;
  valueText?: string;
  stale: boolean;
}

function formatLimitWindows(
  reading: TelemetrySnapshot['limits'],
  t: TFunction,
  locale: string,
): { windows: LimitRowData[]; extra: number } | undefined {
  if (reading.status === 'unavailable' || !reading.value?.windows.length) {
    return undefined;
  }

  const windows = reading.value.windows;
  const ranked = windows
    .map((window) => ({ window, percentage: limitWindowPercentage(window) }))
    .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));

  const shown = ranked.slice(0, 2);
  const extra = ranked.length - shown.length;
  const stale = reading.freshness === 'stale';

  const rowsData = shown.map(({ window, percentage }): LimitRowData => {
    const duration = formatWindowDuration(window.windowSeconds);
    const label = duration
      ? t('sessions.context.sessionDetails.rateLimitWindow', { window: duration })
      : window.windowId;
    const valueText =
      percentage !== undefined
        ? t('sessions.context.sessionDetails.percentValue', {
            value: new Intl.NumberFormat(locale).format(Math.round(percentage)),
          })
        : window.used !== undefined && window.limit !== undefined
          ? t('sessions.context.sessionDetails.rateLimitUsedOfLimit', {
              used: window.used,
              limit: window.limit,
              unit: window.unit,
            })
          : undefined;

    return { id: window.windowId, label, percentage, valueText, stale };
  });

  return { windows: rowsData, extra };
}
