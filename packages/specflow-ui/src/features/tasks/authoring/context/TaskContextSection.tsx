import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuNote,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TooltipProvider,
  Typography,
  treeRowActionClassName,
} from '@nevo/ui';
import { TreeDocumentRow, TreeLevel } from '../../../../shared/document-tree';
import { SectionEditError } from '../SectionEditError';
import { OPEN_UP_TO, SupportSection } from '../SupportSection';
import { useTaskCommands } from '../useTaskAuthoring';
import {
  AddContextDialog,
  type AddContextKind,
  type SpecificationDocumentOption,
} from './AddContextDialog';
import {
  entriesOf,
  movable,
  moved,
  removedByDefault,
  withoutEntry,
  withRequired,
  type ContextRow,
  type ContextView,
  type TaskContextEntry,
} from './contextModel';
import {
  entryDetails,
  entryName,
  entryState,
  kindIcon,
  type ContextNames,
} from './contextPresentation';
import { UseDefaultContextDialog } from './UseDefaultContextDialog';

export interface TaskContextSectionProps {
  readonly specId: string;
  readonly specTitle: string;
  readonly taskId: string;
  readonly revision: string;
  readonly view: ContextView;
  readonly names: ContextNames;
  readonly specificationDocuments: readonly SpecificationDocumentOption[];
  /** The projection allows editing the context. */
  readonly editable: boolean;
  /** Opens the row's target; undefined for entries without one (project documents, paths, text). */
  readonly openTarget: (entry: TaskContextEntry) => (() => void) | undefined;
  readonly onLoadLatest: () => void;
  /** The task has started: its steps read the context; before, it is what the task needs to start. */
  readonly started?: boolean;
}

/**
 * Context: what the person or agent doing a step reads, in declared order. A short label says
 * whether it shows the Engine's default or the task's own list, with the explanation on demand;
 * what the first change of a default does is said where it happens (the row menu and the Add
 * dialog), before it happens. The entries that need attention come first; "Show all" shows every entry in
 * its declared order. Each edit sends the whole list with the manifest revision it was read at
 * (the default written out); "Use default context" sends `context: null`.
 */
export function TaskContextSection(props: TaskContextSectionProps) {
  const { t } = useTranslation();
  const { view, names, editable } = props;
  const { edit } = useTaskCommands(props.specId, props.taskId);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState<AddContextKind>();
  const [restoring, setRestoring] = useState(false);
  const all = showAll || view.attention.length === 0;
  const visible = all ? view.rows : view.attention;
  const entries = entriesOf(view);
  const save = (next: readonly TaskContextEntry[] | null, onSuccess?: () => void) =>
    edit.mutate(
      { expectedRevision: props.revision, context: next === null ? null : [...next] },
      { onSuccess },
    );
  const nameAt = (list: readonly TaskContextEntry[]) => (index: number) =>
    list[index] ? entryName(list[index], names) : String(index + 1);
  const startAdding = (kind: AddContextKind) => {
    edit.reset();
    setAdding(kind);
  };

  // Open, the body's label carries the source; collapsed, the summary keeps it.
  const count = t('taskAuthoring.context.count', { count: view.rows.length });
  const collapsed = `${count} · ${
    view.explicit ? t('taskAuthoring.context.sourceOwn') : t('taskAuthoring.context.sourceDefault')
  }`;
  // The first change of an editable default saves it as the task's own list.
  const firstChange = editable && !view.explicit;
  const optionalMissing = view.attention.filter(
    (row) => row.problem?.kind === 'unresolved' && !row.entry.required,
  ).length;
  // Only an own list can go back, and only once the Engine's default is known.
  const canRestore = editable && view.explicit && view.defaultEntries !== undefined;
  const editError = edit.isError ? (
    <SectionEditError
      taskId={props.taskId}
      error={edit.error}
      onLoadLatest={props.onLoadLatest}
      entryName={nameAt(edit.variables?.context ?? entries)}
    />
  ) : undefined;

  return (
    <SupportSection
      id="task-context-heading"
      title={t('taskAuthoring.section.context')}
      icon="book-open"
      taskId={props.taskId}
      count={count}
      summary={
        optionalMissing > 0
          ? `${collapsed} · ${t('taskAuthoring.context.summaryOptionalMissing', { count: optionalMissing })}`
          : collapsed
      }
      items={view.rows.length}
      openUpTo={OPEN_UP_TO.entries}
      holdsBlocker={view.blocking.length > 0}
      actions={
        editable ? (
          <AddContextMenu
            onChoose={startAdding}
            {...(canRestore
              ? {
                  onUseDefault: () => {
                    edit.reset();
                    setRestoring(true);
                  },
                }
              : {})}
          />
        ) : undefined
      }
      dialogs={
        <>
          <AddContextDialog
            kind={adding}
            onClose={() => setAdding(undefined)}
            taskId={props.taskId}
            specTitle={props.specTitle}
            existing={entries}
            specificationDocuments={props.specificationDocuments}
            firstChange={firstChange}
            pending={edit.isPending}
            error={editError}
            onAdd={(added) => save([...entries, ...added], () => setAdding(undefined))}
          />
          <UseDefaultContextDialog
            open={restoring}
            count={entries.length}
            removed={removedByDefault(view).map((entry) => entryName(entry, names))}
            pending={edit.isPending}
            {...(editError ? { error: editError } : {})}
            onClose={() => setRestoring(false)}
            onConfirm={() => save(null, () => setRestoring(false))}
          />
        </>
      }
    >
      <div className="grid gap-3">
        <SourceLabel
          explicit={view.explicit}
          firstChange={firstChange}
          canRestore={canRestore}
          started={props.started === true}
        />
        {edit.isError && adding === undefined && !restoring ? editError : null}
        {view.blocking.length > 0 ? (
          <InlineNote tone="danger">
            <span className="font-medium text-content-primary">
              {t('taskAuthoring.context.blocking', {
                count: view.blocking.length,
                names: view.blocking.map((row) => entryName(row.entry, names)).join(', '),
              })}
            </span>{' '}
            {t('taskAuthoring.context.blockingBody', { count: view.blocking.length })}
          </InlineNote>
        ) : null}
        {/* The rows' tooltips (kind, problem, note) delay like the Documents rows'. */}
        <TooltipProvider delayDuration={300}>
          <TreeLevel top flat labelledBy="task-context-heading">
            {visible.map((row) => (
              <ContextEntryRow
                key={`${row.index}:${row.entry.kind}`}
                row={row}
                view={view}
                names={names}
                editable={editable && !edit.isPending}
                reserveMenu={editable}
                firstChange={firstChange}
                onOpen={props.openTarget(row.entry)}
                onChange={(next) => save(next(entries))}
              />
            ))}
          </TreeLevel>
        </TooltipProvider>
        {view.attention.length > 0 ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setShowAll(!all)}>
              {all
                ? t('taskAuthoring.context.showProblems')
                : t('taskAuthoring.context.showAll', { count: view.rows.length })}
            </Button>
          </div>
        ) : null}
      </div>
    </SupportSection>
  );
}

/**
 * Which list the section shows, as a short label; what it means opens on demand (a popover, so a
 * tap opens it too): what context is, what the default follows and, for an editable default, what
 * the first change does; for an own list, how the default comes back.
 */
function SourceLabel({
  explicit,
  firstChange,
  canRestore,
  started,
}: {
  explicit: boolean;
  firstChange: boolean;
  canRestore: boolean;
  started: boolean;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const label = explicit
    ? t('taskAuthoring.context.ownLabel')
    : t('taskAuthoring.context.defaultLabel');
  const paragraphs = [
    started
      ? t('taskAuthoring.context.explanationStarted')
      : t('taskAuthoring.context.explanation'),
    explicit ? t('taskAuthoring.context.ownBody') : t('taskAuthoring.context.defaultBody'),
  ];
  const consequence = firstChange
    ? t('taskAuthoring.context.defaultFirstChange')
    : explicit && canRestore
      ? t('taskAuthoring.context.ownRestore')
      : undefined;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        {label}
      </Typography>
      <Popover>
        <PopoverTrigger asChild>
          <IconButton
            icon="info"
            size="sm"
            variant="ghost"
            aria-label={
              explicit
                ? t('taskAuthoring.context.aboutOwn')
                : t('taskAuthoring.context.aboutDefault')
            }
          />
        </PopoverTrigger>
        <PopoverContent align="start" aria-labelledby={titleId} className="w-80 p-3">
          {/* The surface wraps its children in a scroll container: the gap goes on our own grid. */}
          <div className="grid gap-2">
            <Typography as="p" variant="label-md" id={titleId}>
              {label}
            </Typography>
            {paragraphs.map((paragraph) => (
              <Typography
                key={paragraph}
                as="p"
                variant="body-sm"
                className="text-content-secondary"
              >
                {paragraph}
              </Typography>
            ))}
            {consequence ? (
              // Set apart by space as well as weight: the sentence the person acts on.
              <Typography
                as="p"
                variant="body-sm"
                className="mt-1 font-medium text-content-primary"
              >
                {consequence}
              </Typography>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AddContextMenu({
  onChoose,
  onUseDefault,
}: {
  onChoose: (kind: AddContextKind) => void;
  /** Present when the list is the task's own: offers the return to the default. */
  onUseDefault?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Menu modal={false}>
      {/* No Tooltip around a menu trigger: nested asChild triggers swallow taps on touch. */}
      <MenuTrigger asChild>
        <IconButton
          icon="plus"
          size="sm"
          variant="ghost"
          aria-label={t('taskAuthoring.context.add')}
        />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem leadingIcon="file" onSelect={() => onChoose('specification-document')}>
          {t('taskAuthoring.context.addSpecificationDocument')}
        </MenuItem>
        <MenuItem leadingIcon="book-open" onSelect={() => onChoose('project-document')}>
          {t('taskAuthoring.context.addProjectDocument')}
        </MenuItem>
        <MenuItem leadingIcon="folder" onSelect={() => onChoose('path')}>
          {t('taskAuthoring.context.addPath')}
        </MenuItem>
        <MenuItem leadingIcon="info" onSelect={() => onChoose('instructions')}>
          {t('taskAuthoring.context.addInstructions')}
        </MenuItem>
        {onUseDefault ? (
          <>
            <MenuSeparator />
            <MenuItem onSelect={onUseDefault}>{t('taskAuthoring.context.useDefault')}</MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

/** One entry: the shared document row (kind glyph, name, trailing need or problem) and its menu. */
function ContextEntryRow({
  row,
  view,
  names,
  editable,
  reserveMenu,
  firstChange,
  onOpen,
  onChange,
}: {
  row: ContextRow;
  view: ContextView;
  names: ContextNames;
  editable: boolean;
  /** The section offers row menus: every row keeps the `⋯` slot, so trailing labels line up. */
  reserveMenu: boolean;
  /** The list is the default: a change here saves it as the task's own list (said in the menu). */
  firstChange: boolean;
  onOpen: (() => void) | undefined;
  onChange: (next: (entries: readonly TaskContextEntry[]) => TaskContextEntry[]) => void;
}) {
  const { t } = useTranslation();
  const name = entryName(row.entry, names);
  const can = movable(view, row);
  const details = entryDetails(row, t);
  const noteId = useId();

  return (
    <TreeDocumentRow
      name={name}
      wrap={row.entry.kind === 'instructions'}
      glyph={kindIcon[row.entry.kind]}
      state={entryState(row, t)}
      details={details}
      spokenDetail={details.join('. ')}
      current={false}
      {...(onOpen ? { onOpen } : {})}
      menu={
        editable && !row.locked ? (
          <Menu modal={false}>
            <MenuTrigger asChild>
              <IconButton
                className={treeRowActionClassName}
                icon="ellipsis"
                size="sm"
                aria-label={t('taskAuthoring.context.actionsFor', { name })}
              />
            </MenuTrigger>
            <MenuContent align="end" aria-describedby={firstChange ? noteId : undefined}>
              {/* The consequence first: it is read before any choice below. */}
              {firstChange ? (
                <>
                  <MenuNote id={noteId}>{t('taskAuthoring.context.firstChangeMenuNote')}</MenuNote>
                  <MenuSeparator />
                </>
              ) : null}
              <MenuLabel>{t('taskAuthoring.context.whenStarts')}</MenuLabel>
              <MenuRadioGroup
                value={row.entry.required ? 'required' : 'optional'}
                onValueChange={(value) =>
                  onChange((entries) => withRequired(entries, row.index, value === 'required'))
                }
              >
                <MenuRadioItem value="required">
                  {t('taskAuthoring.context.required')}
                </MenuRadioItem>
                <MenuRadioItem value="optional">
                  {t('taskAuthoring.context.optional')}
                </MenuRadioItem>
              </MenuRadioGroup>
              <MenuSeparator />
              {/* Moves and their separator only when the row can move: no doubled separator. */}
              {can.up || can.down ? (
                <>
                  {can.up ? (
                    <MenuItem onSelect={() => onChange((entries) => moved(entries, row.index, -1))}>
                      {t('taskAuthoring.context.moveUp')}
                    </MenuItem>
                  ) : null}
                  {can.down ? (
                    <MenuItem onSelect={() => onChange((entries) => moved(entries, row.index, 1))}>
                      {t('taskAuthoring.context.moveDown')}
                    </MenuItem>
                  ) : null}
                  <MenuSeparator />
                </>
              ) : null}
              <MenuItem
                tone="danger"
                onSelect={() => onChange((entries) => withoutEntry(entries, row.index))}
              >
                {t('taskAuthoring.context.remove')}
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : reserveMenu ? (
          <span aria-hidden="true" className="size-control-height-compact shrink-0" />
        ) : undefined
      }
    />
  );
}
