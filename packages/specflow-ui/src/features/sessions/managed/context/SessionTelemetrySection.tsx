import type { TFunction } from 'i18next';
import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Collapsible,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
  cn,
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
 * Hierarchy rebuild (live owner review, mobile mock + rationale — see this task's handoff):
 * - Cost and token usage are aggregated top-level stat cells (big number over a muted caption),
 *   not inline label+value sentences — `StatCell`.
 * - The full cache-read/cache-write/reasoning token breakdown is real information but does not
 *   permanently occupy space: it sits behind a collapsed-by-default `Collapsible` ("Pozostałe
 *   statystyki tokenów"), expanded on demand.
 * - Context-window occupancy and provider rate limits are NOT the same kind of percentage (one is
 *   "how full is the model's context window", the other is "how much of a provider quota window
 *   is used") and must not read as one undifferentiated list of bars — they are two separate
 *   `<section>`s ("Zużycie sesji" / "Limity dostawcy"), each with its own heading.
 * - The two rate-limit windows most relevant to the user (ranked by usage, same as before) render
 *   side by side as two columns, since a 5h and a 7d budget are directly comparable to each other,
 *   rather than as two full-width stacked rows.
 *
 * Every percentage shown here is unambiguously a "how much is USED" figure, never "how much is
 * left": `limitWindowPercentage`/`formatContextOccupancy` both compute `used / limit` (or, for
 * `unit: 'percent'`, read `LimitWindow.used` directly — the schema has no `remaining`-as-percent
 * reading), and the visible value text spells that out ("43% zajęte" / "43% used", "47%
 * wykorzystane" / "47% used") instead of a bare, directionless "43%".
 *
 * "Zużycie sesji" is explicitly session-scoped (`usageScope` caption): `TelemetrySnapshot.usage`/
 * `.cost` already carry an optional sibling `turn` reading next to `session` (see
 * `sessionTelemetry.ts`), but no fixture populates it and nothing else in this UI reads it yet.
 * This section still only ever reads `.session` — same as before this pass — labelled honestly as
 * such rather than inventing a Turn/Session split the data/product has not decided on.
 */
export function SessionTelemetrySection({ telemetry }: { telemetry?: TelemetrySnapshot }) {
  const { t, i18n } = useTranslation();

  if (!isTelemetryVisible(telemetry)) {
    return null;
  }

  const snapshot = telemetry!;
  const costStat = formatCostStat(snapshot.cost.session, t, i18n.language);
  const tokensStat = formatTokensStat(snapshot.usage.session, i18n.language);
  const tokenBreakdown = formatTokenBreakdown(snapshot.usage.session, t, i18n.language);
  const contextStat = formatContextOccupancy(snapshot.context);
  const limits = formatLimitWindows(snapshot.limits, t, i18n.language);

  const hasUsageSection = !!costStat || !!tokensStat || !!contextStat || !!tokenBreakdown;
  if (!hasUsageSection && !limits) {
    return null;
  }

  return (
    <div className="grid gap-6">
      {hasUsageSection && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <Typography variant="section-label" className="text-content-muted">
              {t('sessions.context.sessionDetails.usageTitle')}
            </Typography>
            <Typography variant="label-sm" className="text-content-muted">
              {t('sessions.context.sessionDetails.usageScope')}
            </Typography>
            {snapshot.refresh.state === 'running' && (
              <Typography variant="label-sm" className="text-content-muted">
                {t('sessions.context.sessionDetails.refreshing')}
              </Typography>
            )}
          </div>
          {(costStat ?? tokensStat) && (
            <div className="grid grid-cols-2 gap-4">
              {costStat && (
                <StatCell
                  value={costStat.text}
                  caption={t('sessions.context.sessionDetails.costLabel')}
                  note={costStat.note}
                  stale={costStat.stale}
                />
              )}
              {tokensStat && (
                <StatCell
                  value={tokensStat.text}
                  caption={t('sessions.context.sessionDetails.tokensStatLabel')}
                  stale={tokensStat.stale}
                />
              )}
            </div>
          )}
          {contextStat && (
            <LimitRow
              label={t('sessions.context.sessionDetails.contextWindowTitle')}
              percentage={contextStat.percentage}
              valueText={t('sessions.context.sessionDetails.contextOccupancyValue', {
                value: new Intl.NumberFormat(i18n.language).format(contextStat.percentage),
              })}
              stale={contextStat.stale}
            />
          )}
          {tokenBreakdown && (
            <Collapsible>
              <Collapsible.Trigger>
                {t('sessions.context.sessionDetails.tokenBreakdownLabel')}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div className="flex items-center gap-1.5">
                  <Typography variant="body-sm" className="text-content-secondary">
                    {tokenBreakdown.text}
                  </Typography>
                  {tokenBreakdown.stale && <StaleMark />}
                </div>
              </Collapsible.Content>
            </Collapsible>
          )}
        </section>
      )}
      {limits && (
        <section className="grid gap-2">
          <Typography variant="section-label" className="text-content-muted">
            {t('sessions.context.sessionDetails.limitsTitle')}
          </Typography>
          <div
            className={cn('grid gap-3', limits.windows.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}
          >
            {limits.windows.map((window) => (
              <LimitRow
                key={window.id}
                label={window.label}
                percentage={window.percentage}
                valueText={window.valueText}
                stale={window.stale}
              />
            ))}
          </div>
          {limits.extra > 0 && (
            <Typography variant="body-sm" className="text-content-muted">
              {t('sessions.context.sessionDetails.moreLimitWindows', { value: limits.extra })}
            </Typography>
          )}
        </section>
      )}
    </div>
  );
}

/** A top-level aggregate stat (cost, token usage): a large bold number over a small muted
 * caption, never inline label+value text — the owner's explicit correction to the previous "one
 * undifferentiated font" telemetry read. `note` is a second, smaller muted line for a caveat that
 * belongs with the number itself (cost basis/meaning), not a separate sentence. */
function StatCell({
  value,
  caption,
  note,
  stale,
}: {
  value: string;
  caption: string;
  note?: string;
  stale: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center gap-1.5">
        <Typography variant="title-lg">{value}</Typography>
        {stale && <StaleMark />}
      </div>
      <Typography variant="label-sm" className="text-content-muted">
        {caption}
      </Typography>
      {note && (
        <Typography variant="label-sm" className="text-content-muted">
          {note}
        </Typography>
      )}
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

/** Big-number stat cell for input/output tokens — locale-compact notation (`12.4K`/`12,4 tys.`),
 * never the full joined breakdown sentence (that moved to `formatTokenBreakdown`, behind the
 * collapsed disclosure). `undefined` when neither figure was observed at all. */
function formatTokensStat(reading: Reading<TokenUsage>, locale: string): FormattedLine | undefined {
  if (reading.status === 'unavailable' || !reading.value) {
    return undefined;
  }

  const { inputTokens, outputTokens } = reading.value;
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  const format = (amount: number | undefined) =>
    amount === undefined
      ? '—'
      : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
          amount,
        );

  return {
    text: `${format(inputTokens)} / ${format(outputTokens)}`,
    stale: reading.freshness === 'stale',
  };
}

/** The detailed token breakdown (cache reads/writes, reasoning) that now lives behind the
 * collapsed "Pozostałe statystyki tokenów" disclosure instead of permanently occupying space next
 * to the input/output stat cell. `undefined` when none of these three dimensions were observed —
 * the disclosure itself then does not render at all, same "missing data hides the row" rule as
 * every other dimension here. */
function formatTokenBreakdown(
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

  push(value.cacheReadTokens, 'sessions.context.sessionDetails.cacheReadTokens');
  push(value.cacheWriteTokens, 'sessions.context.sessionDetails.cacheWriteTokens');
  push(value.reasoningTokens, 'sessions.context.sessionDetails.reasoningTokens');

  if (parts.length === 0) {
    return undefined;
  }

  return { text: parts.join(' · '), stale: reading.freshness === 'stale' };
}

interface CostStat {
  text: string;
  note?: string;
  stale: boolean;
}

function formatCostStat(
  reading: Reading<MoneyUsage>,
  t: TFunction,
  locale: string,
): CostStat | undefined {
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

  return {
    text: formattedAmount,
    note: notes.length > 0 ? notes.join(', ') : undefined,
    stale: reading.freshness === 'stale',
  };
}

/** `occupiedTokens / capacityTokens`: unambiguously "how much of the model's context window is
 * USED", never "how much is left" — the value text built from this (`contextOccupancyValue`)
 * spells that out explicitly rather than showing a bare, directionless percentage. */
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
 * sorted ahead of one that does have a real percentage. Always a "used" fraction: for
 * `unit: 'percent'` the schema's only percent-shaped field is `used` itself (there is no
 * `remaining`-as-percent reading), and for every other unit this is explicitly `used / limit`,
 * never `remaining / limit`. */
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

/** A full-word duration label ("5 godzin" / "7 dni") for the common hour/day-aligned provider
 * windows the owner's mock names directly, instead of the previous abbreviated "okno 5h". Falls
 * back to the old abbreviated/generic wording for a window that isn't an exact hour or day
 * multiple (a rarer case the mock does not cover). */
function formatLimitWindowLabel(seconds: number | undefined, t: TFunction): string | undefined {
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }

  if (seconds % 86400 === 0) {
    return t('sessions.context.sessionDetails.rateLimitWindowDays', { count: seconds / 86400 });
  }

  if (seconds % 3600 === 0) {
    return t('sessions.context.sessionDetails.rateLimitWindowHours', { count: seconds / 3600 });
  }

  return t('sessions.context.sessionDetails.rateLimitWindow', {
    window: `${Math.round(seconds / 60)}m`,
  });
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
    const label = formatLimitWindowLabel(window.windowSeconds, t) ?? window.windowId;
    const valueText =
      percentage !== undefined
        ? t('sessions.context.sessionDetails.rateLimitUsedPercent', {
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
