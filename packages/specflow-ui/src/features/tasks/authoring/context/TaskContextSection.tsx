import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Icon,
  IconButton,
  InformationList,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Typography,
} from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { SectionEditError } from '../SectionEditError';
import { SupportSection } from '../SupportSection';
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
  withoutEntry,
  withRequired,
  type ContextRow,
  type ContextView,
  type TaskContextEntry,
} from './contextModel';
import {
  entryFacts,
  entryName,
  entrySupporting,
  kindIcon,
  type ContextNames,
} from './contextPresentation';

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
  readonly collapsible: boolean;
  /** Opens the row's target; undefined for entries without one (project documents, paths, text). */
  readonly openTarget: (entry: TaskContextEntry) => (() => void) | undefined;
  readonly onLoadLatest: () => void;
}

/**
 * Context: what the person or agent doing a step reads, in declared order. The entries that need
 * attention come first, at every width; "Show all" shows every entry in its declared order. Each
 * edit sends the whole list with the manifest revision it was read at (the default written out).
 */
export function TaskContextSection(props: TaskContextSectionProps) {
  const { t } = useTranslation();
  const { view, names, editable } = props;
  const { edit } = useTaskCommands(props.specId, props.taskId);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState<AddContextKind>();
  const all = showAll || view.attention.length === 0;
  const visible = all ? view.rows : view.attention;
  const entries = entriesOf(view);
  const save = (next: readonly TaskContextEntry[], onSuccess?: () => void) =>
    edit.mutate({ expectedRevision: props.revision, context: [...next] }, { onSuccess });
  const nameAt = (list: readonly TaskContextEntry[]) => (index: number) =>
    list[index] ? entryName(list[index], names) : String(index + 1);
  const startAdding = (kind: AddContextKind) => {
    edit.reset();
    setAdding(kind);
  };

  return (
    <SupportSection
      id="task-context-heading"
      title={t('taskAuthoring.section.context')}
      icon="book-open"
      count={t('taskAuthoring.context.count', { count: view.rows.length })}
      collapsible={props.collapsible}
      holdsBlocker={view.blocking.length > 0}
      actions={editable ? <AddContextMenu onChoose={startAdding} /> : undefined}
    >
      <div className="grid gap-3">
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('taskAuthoring.context.explanation')}
        </Typography>
        {!view.explicit ? <InlineNote>{t('taskAuthoring.context.defaultNote')}</InlineNote> : null}
        {edit.isError && adding === undefined ? (
          <SectionEditError
            taskId={props.taskId}
            error={edit.error}
            onLoadLatest={props.onLoadLatest}
            entryName={nameAt(entries)}
          />
        ) : null}
        {view.blocking.length > 0 ? (
          <InlineNote tone="danger">
            <span className="font-medium text-content-primary">
              {t('taskAuthoring.context.blocking', { count: view.blocking.length })}
            </span>{' '}
            {t('taskAuthoring.context.blockingBody')}
          </InlineNote>
        ) : null}
        <InformationList>
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
        </InformationList>
        {view.attention.length > 0 ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowAll(!all)}>
              {all
                ? t('taskAuthoring.context.showProblems')
                : t('taskAuthoring.context.showAll', { count: view.rows.length })}
            </Button>
          </div>
        ) : null}
      </div>
      <AddContextDialog
        kind={adding}
        onClose={() => setAdding(undefined)}
        taskId={props.taskId}
        specTitle={props.specTitle}
        existing={entries}
        specificationDocuments={props.specificationDocuments}
        pending={edit.isPending}
        error={
          edit.isError ? (
            <SectionEditError
              taskId={props.taskId}
              error={edit.error}
              onLoadLatest={props.onLoadLatest}
              entryName={nameAt(edit.variables?.context ?? entries)}
            />
          ) : undefined
        }
        onAdd={(added) => save([...entries, ...added], () => setAdding(undefined))}
      />
    </SupportSection>
  );
}

function AddContextMenu({ onChoose }: { onChoose: (kind: AddContextKind) => void }) {
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
      </MenuContent>
    </Menu>
  );
}

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

  return (
    <OperationalRow
      titleAs="h3"
      primary={
        row.entry.kind === 'path' ? <span className="font-mono text-body-sm">{name}</span> : name
      }
      onPrimaryClick={onOpen}
      factsLayout="inline"
      compactFacts={entryFacts(row, t)}
      supporting={entrySupporting(row, names, t)}
      leading={
        <span className="flex items-center justify-center text-content-muted">
          <Icon name={kindIcon[row.entry.kind]} size="sm" aria-hidden="true" />
        </span>
      }
      trailing={
        editable && !row.locked ? (
          <Menu modal={false}>
            <MenuTrigger asChild>
              <IconButton
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
