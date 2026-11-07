import {
  useId,
  useImperativeHandle,
  useRef,
  type Dispatch,
  type ReactNode,
  type Ref,
  type SetStateAction,
} from 'react';
import { FolderPlus, Layers, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMessage, type Message } from '../../../../i18n/message';
import {
  AccentBlock,
  Alert,
  Badge,
  Button,
  Icon,
  IconButton,
  InlineNote,
  Skeleton,
  StatusIndicator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
  cn,
  type IconGlyph,
} from '@nevo/ui';
import { useFocusRequest } from '../../../../shared/a11y/useFocusRequest';
import { ChoiceTile, ChoiceTileGroup } from '../../../../shared/controls/ChoiceTile';
import { BranchRef } from './BranchRef';
import { ExistingSummary, MainSummary, NewSummary } from './WorkspaceTileSummaries';
import { activeTile, primaryWorkspace, tileAvailability } from './model/workspaceTiles';
import { availableCountLabel } from './model/workspaceCopy';
import { branchNameOverride } from './model/workspaceOverrides';
import {
  requiredMessages,
  revalidate,
  staleMessages,
  type WorkspaceErrors,
  type WorkspaceProblemField,
} from './model/workspaceValidation';
import { firstChoiceControl } from '../form/createGuide';
import { revealControl } from '../form/useCreateGuide';
import type { Tile, WorkspaceChoice, WorkspaceOptionsState } from './model/workspaceChoice';
import type { WorkspaceConflicts } from './model/workspaceConflicts';

/**
 * Moves focus inside the section once its next render is done (the owner has just changed what is
 * shown: a failure alert is gone, options were refreshed, a field was flagged).
 */
export interface WorkspacePlaceSectionHandle {
  /** Opens the Branch name row if needed and focuses the typed field the server refused. */
  focusField: (field: 'branch' | 'slug') => void;
  /** Focuses the first field the current options flag as invalid, else calls `fallback`. */
  focusFirstInvalid: (fallback?: () => void) => void;
  /**
   * Leads a blocked Create to the field of a workspace problem: opens the Branch name row for its
   * fields, focuses the control and brings it into view.
   */
  focusProblem: (field: WorkspaceProblemField) => void;
}

type FocusRequest =
  | { readonly field: 'base' | 'target' | 'branch' | 'slug' }
  | { readonly problem: WorkspaceProblemField }
  | { readonly firstInvalid: true; readonly fallback?: () => void };

/**
 * The missing-value errors of opened pickers (a changed Start from or Merge into, an Existing
 * workspace without a pick). Shown only once Create was tried, never while the owner is choosing.
 */
function requiredErrors(choice: WorkspaceChoice, active: Tile | null): WorkspaceErrors {
  const errors: WorkspaceErrors = {};
  if (active === 'existing' && !choice.existingWorkspaceId) {
    errors.existing = requiredMessages.existing;
  }

  if (active === 'new' && choice.base.on && !choice.base.ref) {
    errors.base = requiredMessages.base;
  }

  if (active === 'new' && choice.target.on && !choice.target.workspaceId) {
    errors.target = requiredMessages.target;
  }

  return errors;
}

interface TileDefinition {
  id: Tile;
  title: Message;
  description: Message;
  icon: IconGlyph;
}
const tiles: readonly TileDefinition[] = [
  {
    id: 'new',
    title: { key: 'create.workspace.tile.newTitle' },
    description: { key: 'create.workspace.tile.newDescription' },
    icon: FolderPlus,
  },
  {
    id: 'main',
    title: { key: 'create.workspace.tile.mainTitle' },
    description: { key: 'create.workspace.tile.mainDescription' },
    icon: 'folder',
  },
  {
    id: 'existing',
    title: { key: 'create.workspace.tile.existingTitle' },
    description: { key: 'create.workspace.tile.existingDescription' },
    icon: Layers,
  },
];

/** Loading stand-in for a tile: the same surface and padding, text-line placeholders inside. */
function TileSkeleton() {
  return (
    <div className="grid gap-2 rounded-composite border border-solid border-border-subtle bg-surface-control p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/**
 * The workspace section: three radio tiles (new, main, existing) and one summary block after
 * the whole group. The section is controlled: the form owns `choice` and builds the request.
 */
export function WorkspacePlaceSection({
  state,
  refreshing = false,
  refreshFailed = false,
  choice,
  update,
  locked,
  onRefresh,
  onAnnounce,
  title,
  conflicts,
  headingId,
  handleRef,
  showRequired = false,
}: {
  state: WorkspaceOptionsState;
  refreshing?: boolean;
  /** The last refresh failed; the options on screen are the previously loaded ones. */
  refreshFailed?: boolean;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  locked: boolean;
  onRefresh: () => void;
  /** Polite announcement of a result without a visible change (the owner renders the live region). */
  onAnnounce: (message: string) => void;
  /** The specification name (the generated slug and branch preview derive from it). */
  title: string;
  /** What the server refused about the typed branch or slug (shown at the field). */
  conflicts?: WorkspaceConflicts;
  headingId: string;
  /** Lets the owner move focus to the first field the options flagged as invalid. */
  handleRef?: Ref<WorkspacePlaceSectionHandle>;
  /** Create was tried: opened pickers left empty say so at the field. */
  showRequired?: boolean;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const groupName = useId();
  const controls = {
    base: useRef<HTMLElement | null>(null),
    target: useRef<HTMLElement | null>(null),
    branch: useRef<HTMLInputElement | null>(null),
    slug: useRef<HTMLInputElement | null>(null),
  };
  const existingControl = useRef<HTMLElement | null>(null);
  const options = state.status === 'ready' ? state.options : undefined;
  const availability = options ? tileAvailability(options) : undefined;
  const active = options ? activeTile(choice, options) : null;
  const errors: WorkspaceErrors = options
    ? { ...revalidate(choice, options), ...(showRequired ? requiredErrors(choice, active) : {}) }
    : {};
  const sectionRef = useRef<HTMLElement>(null);
  const nothing = Boolean(options) && active === null;
  const resolveFocus = (request: FocusRequest) => {
    if ('field' in request) {
      controls[request.field].current?.focus();

      return;
    }

    if ('problem' in request) {
      revealControl(
        request.problem === 'tile'
          ? firstChoiceControl(sectionRef.current)
          : request.problem === 'existing'
            ? existingControl.current
            : controls[request.problem].current,
      );

      return;
    }

    const order = [
      ['existing', existingControl],
      ['base', controls.base],
      ['target', controls.target],
      ['slug', controls.slug],
      ['branch', controls.branch],
    ] as const;
    const invalid = order.find(([key, ref]) => errors[key] && ref.current);
    if (invalid) {
      invalid[1].current?.focus();
    } else {
      request.fallback?.();
    }
  };

  const requestFocus = useFocusRequest(resolveFocus);
  useImperativeHandle(handleRef, () => ({
    focusField: (field) => {
      update((current) => ({ ...current, ...branchNameOverride(current, true) }));
      requestFocus({ field });
    },
    focusFirstInvalid: (fallback) => requestFocus({ firstInvalid: true, fallback }),
    focusProblem: (field) => {
      if (field === 'slug' || field === 'branch') {
        update((current) => ({ ...current, ...branchNameOverride(current, true) }));
      }

      requestFocus({ problem: field });
    },
  }));

  const select = (tile: Tile) => {
    if (!options || !availability || locked || !availability[tile].ok) {
      return;
    }

    const next: WorkspaceChoice = { ...choice, tile };
    const nextErrors = revalidate(next, options);
    const { existing: existingError, ...settingsErrors } = nextErrors;
    const stale =
      tile === 'new'
        ? Object.keys(settingsErrors).length > 0
        : tile === 'existing' && existingError !== undefined;
    if (stale) {
      onAnnounce(t('create.workspace.staleAnnouncement'));
    }

    update(next);
  };

  const meta = (tile: Tile): ReactNode => {
    if (!options || !availability) {
      return null;
    }

    if (tile === 'new') {
      return <Badge tone="info">{t('create.workspace.recommended')}</Badge>;
    }

    if (tile === 'main') {
      const primary = primaryWorkspace(options);

      return (
        <>
          {primary?.branch ? (
            <BranchRef name={primary.branch} />
          ) : (
            <span>{t('create.workspace.currentCheckout')}</span>
          )}
          {primary?.state === 'dirty' && (
            <Badge tone="attention">{t('create.workspace.dirtyBadge')}</Badge>
          )}
        </>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <StatusIndicator tone="success" />
        {text(availableCountLabel(availability.existing.count ?? 0))}
      </span>
    );
  };

  const body = (() => {
    if (state.status === 'loading') {
      return (
        <div aria-busy="true" className="grid gap-4">
          <div className="grid gap-3 @2xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <TileSkeleton key={index} />
            ))}
          </div>
          <AccentBlock>
            <div className="grid max-w-content-narrow gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </AccentBlock>
        </div>
      );
    }

    if (state.status === 'error') {
      return (
        <Alert
          role="alert"
          tone="attention"
          title={t('create.workspace.loadFailed.title')}
          className="max-w-content-narrow"
        >
          <p>{t('create.workspace.loadFailed.body')}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={onRefresh}>
            {t('common.retry')}
          </Button>
        </Alert>
      );
    }

    if (state.status === 'forbidden') {
      return (
        <Alert
          role="alert"
          tone="danger"
          icon={Lock}
          title={t('create.errors.forbiddenTitle')}
          className="max-w-content-narrow"
        >
          <p>{t('create.errors.readOnlyForm')}</p>
        </Alert>
      );
    }

    const ready = state.options;
    const available = tileAvailability(ready);

    return (
      <>
        <ChoiceTileGroup aria-labelledby={headingId} columns="@2xl:grid-cols-3">
          {tiles.map((tile) => {
            const tileState = available[tile.id];
            const blocked = !tileState.ok;

            return (
              <ChoiceTile
                key={tile.id}
                name={groupName}
                value={tile.id}
                checked={active === tile.id}
                blocked={blocked}
                onSelect={() => select(tile.id)}
                iconClassName="text-content-secondary"
                icon={<Icon name={tile.icon} />}
                title={text(tile.title)}
                description={
                  blocked && tileState.reason ? text(tileState.reason) : text(tile.description)
                }
                meta={blocked ? undefined : meta(tile.id)}
              />
            );
          })}
        </ChoiceTileGroup>
        {available.new.ok &&
          active !== 'new' &&
          (available.main.protected === true || available.existing.protected === true) && (
            <InlineNote className="max-w-content-narrow">
              {t('create.workspace.protectedSuggestion.text')}{' '}
              <Button
                size="sm"
                variant="secondary"
                className="ml-1 align-middle"
                onClick={() => select('new')}
              >
                {t('create.workspace.protectedSuggestion.action')}
              </Button>
            </InlineNote>
          )}
        {nothing && (
          <Alert
            role="alert"
            tone="attention"
            title={t('create.workspace.nothing.title')}
            className="max-w-content-narrow"
          >
            <p>{t('create.workspace.nothing.body')}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              leadingIcon="refresh"
              onClick={onRefresh}
            >
              {t('create.workspace.refreshOptionsAction')}
            </Button>
          </Alert>
        )}
        {active === 'new' && available.new.ok ? (
          // The new workspace's decision rows sit in the section like the rest of the form.
          <NewSummary
            options={ready}
            choice={choice}
            update={update}
            errors={errors}
            title={title}
            conflicts={conflicts}
            onAnnounce={onAnnounce}
            controls={controls}
            onRequestFocus={(field) => requestFocus({ field })}
          />
        ) : active ? (
          <AccentBlock role="group" aria-label={t('create.workspace.summaryLabel')}>
            <div className="grid max-w-content-narrow grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
              {!available[active].ok ? (
                <>
                  <Icon name="triangle-alert" className="text-status-attention" />
                  <Typography as="p" variant="body-md" className="min-w-0 text-content-primary">
                    {text(staleMessages.tile)}
                  </Typography>
                </>
              ) : active === 'main' ? (
                <MainSummary options={ready} />
              ) : (
                <ExistingSummary
                  options={ready}
                  choice={choice}
                  update={update}
                  errors={errors}
                  controlRef={existingControl}
                />
              )}
            </div>
          </AccentBlock>
        ) : null}
      </>
    );
  })();

  return (
    <section ref={sectionRef} className="grid min-w-0 gap-4" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Typography as="h2" variant="title-md" id={headingId}>
            {t('create.workspace.heading')}
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {t('create.workspace.intro')}
          </Typography>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label={t('create.workspace.refreshOptions')}
                icon="refresh"
                size="sm"
                onClick={onRefresh}
              />
            </TooltipTrigger>
            <TooltipContent>{t('create.workspace.refreshOptions')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p
        role="status"
        className={cn('text-body-sm text-content-secondary', !refreshing && 'sr-only')}
      >
        {refreshing ? t('create.workspace.refreshing') : null}
      </p>
      {refreshFailed && state.status === 'ready' && !refreshing && (
        <Alert
          role="alert"
          tone="attention"
          title={t('create.workspace.refreshFailed.title')}
          className="max-w-content-narrow"
        >
          <p>{t('create.workspace.refreshFailed.body')}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={onRefresh}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      <fieldset disabled={locked} className="contents">
        {body}
      </fieldset>
    </section>
  );
}
