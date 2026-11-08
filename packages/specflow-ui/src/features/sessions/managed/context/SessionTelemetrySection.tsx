import type { TFunction } from 'i18next';
import { useCallback, useId, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Collapsible,
  InlineNote,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@nevo/ui';
import type { TelemetryLimitWindow, TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { isLimitsRefreshOffered, isTelemetryVisible } from './sessionTelemetry';
import type { LimitsRefreshControl } from './sessionContextTypes';

type TokenReading = TelemetrySnapshot['usage']['session'];
type MoneyReading = TelemetrySnapshot['cost']['session'];

/**
 * Low-emphasis "Session details" (full-session-screen-structure.md §7.2/§23): token usage, cost,
 * context occupancy and rate limits, placed last in Context — after Related Tasks — and never
 * competing visually with the three Primary-adjacent sections above it. Data comes from the
 * Session telemetry API (reference.api.session-telemetry) through `sessionTelemetryStore.ts`.
 *
 * Every dimension degrades independently: a `Reading` with `status: 'unavailable'` (or with no
 * meaningful sub-values even when `available`/`partial`) simply omits its own line, never a
 * placeholder/zero. When every dimension is unavailable this whole section renders nothing, the
 * same "missing data hides the section" rule the rest of `SessionContext` already follows.
 *
 * Hierarchy:
 * - Cost and token usage are aggregated top-level stat cells (a compact `title-md` tabular value over a muted caption),
 *   not inline label+value sentences — `StatCell`.
 * - The full cache-read/cache-write/reasoning token breakdown is real information but does not
 *   permanently occupy space: it sits behind a collapsed-by-default `Collapsible` ("Pozostałe
 *   statystyki tokenów"), expanded on demand.
 * - Context-window occupancy and provider rate limits are NOT the same kind of percentage (one is
 *   "how full is the model's context window", the other is "how much of a provider quota window
 *   is used") and must not read as one undifferentiated list of bars — they are two separate
 *   `<section>`s ("Zużycie sesji" / "Limity dostawcy"), each with its own heading.
 * - The two rate-limit windows most relevant to the user (ranked by usage, same as before) render
 *   as two full-width stacked rows (label + value header, then the bar), so at a ~330 px
 *   Secondary each bar keeps the full column width.
 *
 * Every percentage shown here is unambiguously a "how much is USED" figure, never "how much is
 * left": `limitWindowPercentage`/`formatContextOccupancy` both compute `used / limit` (or, for
 * `unit: 'percent'`, read `LimitWindow.used` directly — the schema has no `remaining`-as-percent
 * reading), and the visible value text spells that out ("43% zajęte" / "43% used", "47%
 * wykorzystane" / "47% used") instead of a bare, directionless "43%".
 *
 * "Zużycie sesji" is session-scoped by its title: `TelemetrySnapshot.usage`/
 * `.cost` carry an optional sibling `turn` reading next to `session`, but no reviewed UX places
 * it and nothing else in this UI reads it yet.
 * This section still only ever reads `.session` labelled honestly as
 * such rather than inventing a Turn/Session split the data/product has not decided on.
 *
 * Unlike cost/tokens, "Model context window" is
 * NOT a session aggregate — architecturally, a model's context window is scoped to one Turn/model
 * invocation. It still renders inside the "Zużycie sesji" section (there is nowhere better for a
 * single always-visible row), but `LimitRow`'s `scopeCaption` names the actual Turn/model it
 * measures (`formatContextWindowScope`, reading `ContextUsage.turnId`/`.modelId` — already real,
 * already populated data, unlike `usage.turn`/`cost.turn` above) instead of silently inheriting
 * the section's "for the whole session" claim.
 *
 * Provider limits carry the only refresh (session-actions-ux §1): a ghost "Odśwież" in their
 * heading row, offered when the reading is `refreshable` and the user may manage the Session
 * (`limitsRefresh` present). With the control the section stays even without rows, saying why;
 * `NOT_AUTHORIZED` limits render nothing at all. `migration` is not shown (§1.3).
 */
export function SessionTelemetrySection({
  telemetry,
  runningTurnId,
  limitsRefresh,
}: {
  telemetry?: TelemetrySnapshot;
  /** The Turn in flight right now, if any (`SessionContextViewModel.runningTurnId`). Decides
   * whether the context-window measurement is captioned as the current or the last Turn. */
  runningTurnId?: string;
  /** The limits refresh command; absent when the user may not manage the Session. */
  limitsRefresh?: LimitsRefreshControl;
}) {
  const { t, i18n } = useTranslation();
  const usageTitleId = useId();
  const limitsTitleId = useId();
  const limitsHeading = useRef<HTMLHeadingElement | null>(null);
  // Focus on the heading (after a refusal) must not fall to the document when the section goes.
  const attachLimitsHeading = useCallback((node: HTMLHeadingElement | null) => {
    limitsHeading.current = node;
    if (!node) {
      return;
    }

    return () => {
      limitsHeading.current = null;
      if (node.ownerDocument.activeElement === node) {
        node.closest<HTMLElement>('[data-context-focus-fallback]')?.focus();
      }
    };
  }, []);
  const canRefresh = !!limitsRefresh && !limitsRefresh.refused;

  if (!telemetry || (!isTelemetryVisible(telemetry, canRefresh) && !limitsRefresh?.refusedNote)) {
    return null;
  }

  const snapshot = telemetry;
  const costStat = formatCostStat(snapshot.cost.session, t, i18n.language);
  const tokensStat = formatTokensStat(snapshot.usage.session, i18n.language);
  const tokenBreakdown = formatTokenBreakdown(snapshot.usage.session, t, i18n.language);
  const contextStat = formatContextOccupancy(snapshot.context);
  const limits = formatLimitWindows(snapshot.limits, t, i18n.language);
  const limitsMasked =
    snapshot.limits.status === 'unavailable' && snapshot.limits.reason === 'NOT_AUTHORIZED';
  const refreshOffered = isLimitsRefreshOffered(snapshot, canRefresh);
  const showLimits = !limitsMasked && (!!limits || refreshOffered || !!limitsRefresh?.refusedNote);
  // One indicator for a refresh in flight: the control's own label (§1.2).
  const refreshPending =
    !!limitsRefresh?.sending ||
    (snapshot.refresh.state !== 'idle' && snapshot.refresh.groups.includes('limits'));
  const refreshBlocked = refreshPending || !!limitsRefresh?.coolingDown;
  const notes = [
    limitsReadingNote(snapshot.limits, !!limits, refreshOffered),
    limitsCommandNote(limitsRefresh),
  ].filter((note) => note !== undefined);
  const politeNotes = notes.filter((note) => note.tone !== 'danger');
  const alertNotes = notes.filter((note) => note.tone === 'danger');

  const hasUsageSection = !!costStat || !!tokensStat || !!contextStat || !!tokenBreakdown;
  if (!hasUsageSection && !showLimits) {
    return null;
  }

  // `aria-disabled` keeps focus on the control while it waits; the handler ignores presses.
  const pressRefresh = async () => {
    if (!limitsRefresh || refreshBlocked) {
      return;
    }

    if ((await limitsRefresh.refresh()) === 'refused') {
      // The control is gone for this mount: focus lands on its section instead of the document.
      limitsHeading.current?.focus();
    }
  };

  return (
    <div className="grid gap-6">
      {hasUsageSection && (
        <section className="grid gap-3" aria-labelledby={usageTitleId}>
          {/* The title alone says it is session-wide ("Zużycie sesji"); a "w całej sesji" caption
              next to it only repeated it. */}
          <Typography as="h3" id={usageTitleId} variant="section-label">
            {t('sessions.context.sessionDetails.usageTitle')}
          </Typography>
          {(costStat ?? tokensStat) && (
            // Cost sizes to its (short) value; tokens take the rest, so neither column wraps.
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8">
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
              scopeCaption={formatContextWindowScope(
                contextStat.turnId,
                contextStat.modelId,
                runningTurnId,
                t,
              )}
            />
          )}
          {tokenBreakdown && (
            // The trigger owns `px-control-padding-compact`; bleeding the whole disclosure by the
            // same token puts its chevron on the content edge shared by the rows above, while the
            // hover surface extends into the host padding (no local padding override).
            <Collapsible className="-mx-control-padding-compact">
              <Collapsible.Trigger className="text-body-sm">
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
      {showLimits && (
        // Spacing by margins, not `gap`: the two live regions below stay mounted while empty.
        <section className="grid" aria-labelledby={limitsTitleId}>
          <div className="flex flex-wrap items-baseline gap-2">
            <Typography
              ref={attachLimitsHeading}
              as="h3"
              id={limitsTitleId}
              tabIndex={-1}
              variant="section-label"
              className="outline-none"
            >
              {t('sessions.context.sessionDetails.limitsTitle')}
            </Typography>
            {refreshOffered && (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon="refresh"
                className="ml-auto"
                aria-disabled={refreshBlocked || undefined}
                // The visible "Odśwież" relies on the heading; the name says what it refreshes.
                aria-label={
                  refreshPending
                    ? undefined
                    : t('sessions.context.sessionDetails.refreshLimitsLabel')
                }
                onClick={() => void pressRefresh()}
              >
                {refreshPending
                  ? t('sessions.context.sessionDetails.refreshingLimits')
                  : t('sessions.context.sessionDetails.refreshLimits')}
              </Button>
            )}
          </div>
          {limits && (
            // One full-width row per window (label + value header, then the bar), never two
            // cramped columns: at ~330 px the side-by-side split left each bar a few dozen px.
            <div className="mt-3 grid gap-4">
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
          )}
          {limits && limits.extra > 0 && (
            <Typography variant="body-sm" className="mt-3 text-content-muted tabular-nums">
              {t('sessions.context.sessionDetails.moreLimitWindows', { value: limits.extra })}
            </Typography>
          )}
          {/* One persistent region per politeness; only the text inside changes. */}
          <div role="status">
            {politeNotes.map((note) => (
              <LimitsNoteLine key={note.key} note={note} />
            ))}
          </div>
          <div role="alert">
            {alertNotes.map((note) => (
              <LimitsNoteLine key={note.key} note={note} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type LimitsNoteKey =
  | 'limitsNotRead'
  | 'refreshFailed'
  | 'limitsReadFailed'
  | 'refreshCooldown'
  | 'refreshUnavailable'
  | 'refreshRejected'
  | 'refreshUnconfirmed';
interface LimitsNote {
  key: LimitsNoteKey;
  tone: 'info' | 'attention' | 'danger';
}

/** What the limits reading itself says when it has no rows or its last refresh failed. */
function limitsReadingNote(
  reading: TelemetrySnapshot['limits'],
  hasRows: boolean,
  refreshOffered: boolean,
): LimitsNote | undefined {
  if (reading.reason === 'REFRESH_FAILED') {
    if (hasRows) {
      return { key: 'refreshFailed', tone: 'attention' };
    }

    if (reading.status === 'unavailable' && refreshOffered) {
      return { key: 'limitsReadFailed', tone: 'attention' };
    }
  }

  return !hasRows && refreshOffered ? { key: 'limitsNotRead', tone: 'info' } : undefined;
}

/** What the last refresh command left for the user to know (refusal, unconfirmed, cooldown). */
function limitsCommandNote(refresh: LimitsRefreshControl | undefined): LimitsNote | undefined {
  if (refresh?.refusedNote) {
    return { key: 'refreshUnavailable', tone: 'info' };
  }

  if (refresh?.unconfirmed) {
    return { key: 'refreshUnconfirmed', tone: 'danger' };
  }

  if (refresh?.rejected) {
    return { key: 'refreshRejected', tone: 'attention' };
  }

  return refresh?.coolingDown ? { key: 'refreshCooldown', tone: 'info' } : undefined;
}

/** `InlineNote` has no live region of its own: info and attention notes go to the section's polite
 * status region, only an unconfirmed request to its alert region (session-actions-ux rules). */
function LimitsNoteLine({ note }: { note: LimitsNote }) {
  const { t } = useTranslation();

  return (
    <InlineNote tone={note.tone} className="mt-3">
      {t(`sessions.context.sessionDetails.${note.key}`)}
    </InlineNote>
  );
}

/** A top-level aggregate stat (cost, token usage): a compact inspector-sized number over a muted
 * caption, never inline label+value text, so telemetry does not read as one
 * undifferentiated font. `note` is a second, smaller muted line for a caveat that
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
    <div className="grid min-w-0 content-start gap-0.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <Typography variant="title-md" className="tabular-nums">
          {value}
        </Typography>
        {stale && <StaleMark />}
      </div>
      <Typography variant="body-sm" className="text-content-muted">
        {caption}
      </Typography>
      {note && (
        <Typography variant="body-sm" className="text-content-muted">
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
 *
 * `scopeCaption` (context-window occupancy only, see `formatContextWindowScope`): this row sits
 * inside a section titled "Zużycie sesji" (session-wide), which is
 * accurate for the cost/token stat cells next to it but NOT for context-window occupancy — a
 * model's context window is architecturally scoped to one Turn/model invocation, never summed
 * across a Session. Rather than inventing a Session-wide number that doesn't exist, this small
 * sub-caption names the actual Turn/model the percentage is for, so the row doesn't silently
 * inherit the ambient "whole session" claim it sits under.
 */
function LimitRow({
  label,
  percentage,
  valueText,
  stale,
  scopeCaption,
}: {
  label: string;
  percentage?: number;
  valueText?: string;
  stale: boolean;
  scopeCaption?: string;
}) {
  const labelId = useId();

  return (
    <div className="grid min-w-0 gap-1.5">
      {/* Header: label left, value right on one line; the bar below spans the whole column. */}
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Typography id={labelId} variant="body-sm" className="text-content-secondary">
            {label}
          </Typography>
          {stale && <StaleMark />}
        </span>
        {valueText && (
          <Typography variant="body-sm" className="ml-auto tabular-nums text-content-primary">
            {valueText}
          </Typography>
        )}
      </div>
      {percentage !== undefined && (
        <Progress
          value={percentage}
          max={100}
          aria-labelledby={labelId}
          style={progressFillStyle(progressTone(percentage))}
        />
      )}
      {scopeCaption && (
        <Typography variant="body-sm" className="text-content-muted">
          {scopeCaption}
        </Typography>
      )}
    </div>
  );
}

/**
 * Usage threshold tiers (a product default — see module header: `Reading`/`LimitWindow` have
 * no server-provided tone/threshold field today, so this is a hardcoded client-side cutoff, not a
 * value read from the telemetry contract. Revisit if the contract documents one).
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
function formatTokensStat(reading: TokenReading, locale: string): FormattedLine | undefined {
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
  reading: TokenReading,
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

function formatCostStat(reading: MoneyReading, t: TFunction, locale: string): CostStat | undefined {
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
 * spells that out explicitly rather than showing a bare, directionless percentage. Also carries
 * `turnId`/`modelId` straight through from `ContextUsage` (already real, observed data — see
 * `formatContextWindowScope`), so the caller can attribute the percentage to the Turn/model it
 * actually measures instead of leaving that implicit. */
function formatContextOccupancy(
  reading: TelemetrySnapshot['context'],
): { percentage: number; stale: boolean; turnId?: string; modelId?: string } | undefined {
  if (reading.status === 'unavailable' || !reading.value) {
    return undefined;
  }

  const { occupiedTokens, capacityTokens, turnId, modelId } = reading.value;
  if (
    occupiedTokens === undefined ||
    capacityTokens === undefined ||
    capacityTokens <= 0 ||
    occupiedTokens < 0
  ) {
    return undefined;
  }

  const percentage = Math.min(100, Math.round((occupiedTokens / capacityTokens) * 100));

  return { percentage, stale: reading.freshness === 'stale', turnId, modelId };
}

/**
 * "Model context window" sits inside a section
 * titled as session-wide ("Zużycie sesji"), but a model's context window is
 * architecturally scoped to ONE Turn/model invocation, never summed or meaningful across a whole
 * Session — unlike cost/token usage next to it, which genuinely ARE session aggregates. Labelling
 * the row "for the whole session" by ambient proximity would be a real (if implicit) scope claim
 * this data cannot back up.
 *
 * This does NOT require new data: `ContextUsage.turnId`/`.modelId` are already part of the
 * documented contract and already populated by the demo fixtures (unlike `usage.turn`/`cost.turn`,
 * which no fixture populates — that gap is real and stays unfixed). When at least one of
 * `turnId`/`modelId` is present, this names it explicitly instead of leaving the row to silently
 * inherit the section's "whole session" caption. `undefined` when the reading carries neither (the
 * row's own label, "Model context window", makes no explicit Session-wide claim on its own, so
 * omitting the caption here is honest, not misleading — it just can't say MORE than that). */
function formatContextWindowScope(
  turnId: string | undefined,
  modelId: string | undefined,
  runningTurnId: string | undefined,
  t: TFunction,
): string | undefined {
  // "Current Turn" only when the measured Turn is the one in flight right now; a measurement whose
  // Turn has settled (no running Turn, or a newer one running that has not been measured yet) is
  // the last Turn's. Never inferred from the Session's own status: an active Session that is
  // ready for the next message has no running Turn. The technical Turn id stays out of the view.
  if (turnId) {
    const current = turnId === runningTurnId;
    if (modelId) {
      return current
        ? t('sessions.context.sessionDetails.contextWindowScopeTurnAndModel', { model: modelId })
        : t('sessions.context.sessionDetails.contextWindowScopeLastTurnAndModel', {
            model: modelId,
          });
    }

    return current
      ? t('sessions.context.sessionDetails.contextWindowScopeTurnOnly')
      : t('sessions.context.sessionDetails.contextWindowScopeLastTurnOnly');
  }

  if (modelId) {
    return t('sessions.context.sessionDetails.contextWindowScopeModelOnly', { model: modelId });
  }

  return undefined;
}

/** `undefined` when a window's usage cannot be expressed as a percentage (missing `used`, or
 * missing `limit` for a non-`percent` unit) — such a window is still shown, just without a
 * computed ratio (and therefore without a `Progress` bar — never a fake/zero one), and never
 * sorted ahead of one that does have a real percentage. Always a "used" fraction: for
 * `unit: 'percent'` the schema's only percent-shaped field is `used` itself (there is no
 * `remaining`-as-percent reading), and for every other unit this is explicitly `used / limit`,
 * never `remaining / limit`. */
function limitWindowPercentage(window: TelemetryLimitWindow): number | undefined {
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
 * windows, instead of an abbreviated "5h". Falls back to abbreviated/generic wording for a window
 * that isn't an exact hour or day multiple (a rarer case). */
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
