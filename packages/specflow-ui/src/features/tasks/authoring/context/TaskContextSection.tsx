import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
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
}

/**
 * Context: what the person or agent doing a step reads, in declared order. The section says
 * whether it shows the Engine's default or the task's own list, and what the first change does
 * before it happens. The entries that need attention come first; "Show all" shows every entry in
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

  const count = `${t('taskAuthoring.context.count', { count: view.rows.length })} · ${
    view.explicit ? t('taskAuthoring.context.sourceOwn') : t('taskAuthoring.context.sourceDefault')
  }`;
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
      taskId={props.taskId}
      count={count}
      summary={
        optionalMissing > 0
          ? `${count} · ${t('taskAuthoring.context.summaryOptionalMissing', { count: optionalMissing })}`
          : count
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
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('taskAuthoring.context.explanation')}
        </Typography>
        <SourceNote explicit={view.explicit} editable={editable} />
        {edit.isError && adding === undefined && !restoring ? editError : null}
        {view.blocking.length > 0 ? (
          <InlineNote tone="danger">
            <span className="font-medium text-content-primary">
              {t('taskAuthoring.context.blocking', { count: view.blocking.length })}
            </span>{' '}
            {t('taskAuthoring.context.blockingBody')}
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
 * Which list the section shows, and what the first change does before it happens (A2): the
 * Engine's default follows the task until a change saves it as the task's own list.
 */
function SourceNote({ explicit, editable }: { explicit: boolean; editable: boolean }) {
  const { t } = useTranslation();

  return (
    <InlineNote icon="info">
      <span className="font-medium text-content-primary">
        {explicit ? t('taskAuthoring.context.ownTitle') : t('taskAuthoring.context.defaultTitle')}
      </span>{' '}
      {explicit
        ? t('taskAuthoring.context.ownBody')
        : editable
          ? `${t('taskAuthoring.context.defaultBody')} ${t('taskAuthoring.context.defaultFirstChange')}`
          : t('taskAuthoring.context.defaultBody')}
    </InlineNote>
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
  onOpen,
  onChange,
}: {
  row: ContextRow;
  view: ContextView;
  names: ContextNames;
  editable: boolean;
  onOpen: (() => void) | undefined;
  onChange: (next: (entries: readonly TaskContextEntry[]) => TaskContextEntry[]) => void;
}) {
  const { t } = useTranslation();
  const name = entryName(row.entry, names);
  const can = movable(view, row);
  const details = entryDetails(row, t);

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
            <MenuContent align="end">
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
              <MenuItem
                tone="danger"
                onSelect={() => onChange((entries) => withoutEntry(entries, row.index))}
              >
                {t('taskAuthoring.context.remove')}
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : undefined
      }
    />
  );
}
