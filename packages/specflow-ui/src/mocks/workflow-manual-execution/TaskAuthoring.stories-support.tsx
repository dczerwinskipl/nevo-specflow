import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Collapsible,
  CheckboxField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
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
  RadioGroup,
  RadioGroupOption,
  TextInput,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@nevo/ui';
import { OperationalRow } from '../../shared/operational-list';
import type { SemanticSupporting } from '../../shared/operational-list/OperationalRow.types';
import { WorkspaceSection } from '../../shared/workspace-section';
import { tasks, typeOf, type MockTask, stepTitle } from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY. Task authoring beyond task.md: the Task's own documents, its context list
 * (F20 entry kinds) and its dependencies. Structured facts are edited where they are read, in the
 * Task page sections (header Add + row menu); documents open in the Secondary editor.
 */

const noop = () => undefined;
type IconName = ComponentProps<typeof Icon>['name'];
type IconKey = NonNullable<ComponentProps<typeof WorkspaceSection.Header>['icon']>;

/* ------------------------------------------------------------------------------------------ */
/* Fixtures                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type ContextKind =
  | 'task-document'
  | 'specification-document'
  | 'repository-document'
  | 'path'
  | 'instructions'
  | 'path-hint';

export interface ContextEntry {
  readonly key: string;
  readonly kind: ContextKind;
  readonly name: string;
  readonly ref?: string;
  readonly required: boolean;
  readonly note?: string;
  readonly detail?: string;
  /** The Task's own task.md: always first, cannot be removed or made optional. */
  readonly locked?: boolean;
  readonly problem?: 'missing' | 'superseded';
  /**
   * A process artifact: a document or path produced during the process. Missing is "Awaited"
   * (neutral, not a problem on Approve); a required one is still needed when the step starts.
   */
  readonly artifact?: boolean;
  readonly replacement?: string;
}

const kindLabel: Record<ContextKind, string> = {
  'task-document': 'Task document',
  'specification-document': 'Specification document',
  'repository-document': 'Project document',
  path: 'Code path',
  instructions: 'Instructions',
  'path-hint': 'Where to change',
};

const kindIcon: Record<ContextKind, IconName> = {
  'task-document': 'file',
  'specification-document': 'file',
  'repository-document': 'book-open',
  path: 'folder',
  instructions: 'info',
  'path-hint': 'filter',
};

/**
 * A section's add action once it has rows: the WorkspaceHeader icon-action pattern (ghost sm
 * IconButton named by its label, the same label as tooltip).
 */
function SectionAddButton({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton icon="plus" size="sm" variant="ghost" aria-label={label} onClick={noop} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** An empty section's one call to action: a labelled button, replaced by "+" once rows exist. */
function SectionCallToAction({ label }: { label: string }) {
  return (
    <div>
      <Button size="sm" variant="secondary" onClick={noop}>
        {label}
      </Button>
    </div>
  );
}

/** T-04's effective context, in declared order (defaults written out on first edit). */
export const draftContext: readonly ContextEntry[] = [
  { key: 'task', kind: 'task-document', name: 'task.md', required: true, locked: true },
  {
    key: 'screens',
    kind: 'task-document',
    name: 'screens.md',
    required: true,
    note: 'Return-flow screens and their states',
  },
  {
    key: 'overview',
    kind: 'specification-document',
    name: 'Overview',
    ref: 'overview.md',
    required: true,
  },
  {
    key: 'ux',
    kind: 'specification-document',
    name: 'UX',
    ref: 'ux.md',
    required: true,
    note: 'Sign-in flow and where the user returns',
  },
  {
    key: 'interaction',
    kind: 'repository-document',
    name: 'UI interaction model',
    ref: 'product.specflow.ui.interaction-model',
    required: false,
    note: 'Back and Close semantics',
  },
  {
    key: 'router',
    kind: 'path',
    name: 'packages/specflow-ui/src/app/router/**',
    required: true,
    detail: 'Matches 14 files',
    note: 'Where the previous route is restored',
  },
  {
    key: 'findings',
    kind: 'specification-document',
    name: 'Refresh strategy findings',
    ref: 'notes/refresh-findings.md',
    required: true,
    artifact: true,
    problem: 'missing',
  },
  {
    key: 'old-flow',
    kind: 'specification-document',
    name: 'Old login flow',
    ref: 'notes/old-login-flow.md',
    required: true,
    problem: 'missing',
  },
  {
    key: 'legacy-nav',
    kind: 'repository-document',
    name: 'Legacy navigation',
    ref: 'design-system.legacy.navigation',
    required: false,
    problem: 'superseded',
    replacement: 'product.specflow.ui.interaction-model',
  },
  {
    key: 'instructions',
    kind: 'instructions',
    name: 'Keep the existing Back behaviour for deep links.',
    required: true,
  },
  {
    key: 'hint',
    kind: 'path-hint',
    name: 'Change only the app shell',
    required: true,
    detail: 'Allowed: packages/specflow-ui/src/app/** · Not: packages/nevo-ui/**',
  },
];

/**
 * A supporting section of the Task page. On Narrow it is a disclosure: the title and count are the
 * trigger, the add action stays beside it; collapsed unless it holds a blocker.
 */
function SupportSection({
  id,
  title,
  icon,
  count,
  actions,
  collapsible,
  defaultExpanded,
  children,
}: {
  id: string;
  title: string;
  icon: IconKey;
  count?: number | string;
  actions?: ReactNode;
  collapsible: boolean;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  if (!collapsible) {
    return (
      <WorkspaceSection aria-labelledby={id}>
        <WorkspaceSection.Header
          id={id}
          title={title}
          icon={icon}
          count={count}
          actions={actions}
        />
        {children}
      </WorkspaceSection>
    );
  }

  return (
    <Collapsible defaultExpanded={defaultExpanded} className="grid gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Collapsible.Trigger className="min-w-0 flex-1 px-0">
          <span id={id} className="text-section-label uppercase text-content-primary">
            {title}
          </span>
          {count !== undefined ? (
            <span className="ml-2 text-body-sm text-content-muted">{count}</span>
          ) : null}
        </Collapsible.Trigger>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Documents                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function TaskDocumentsSection({
  editable,
  collapsible = false,
}: {
  editable: boolean;
  collapsible?: boolean;
}) {
  const expanded = false;

  return (
    <SupportSection
      id="task-documents-heading"
      title="Documents"
      icon="file"
      count={2}
      actions={editable ? <SectionAddButton label="New document" /> : undefined}
      collapsible={collapsible}
      defaultExpanded={expanded}
    >
      <InformationList>
        {[
          { name: 'task.md', facts: ['Task content', 'Edited today 09:12'] as const, fixed: true },
          {
            name: 'screens.md',
            facts: ['Task document', 'Edited yesterday'] as const,
            fixed: false,
          },
        ].map((doc) => (
          <OperationalRow
            key={doc.name}
            primary={doc.name}
            // Opens the document as a tab in the Secondary editor.
            onPrimaryClick={noop}
            primaryAriaLabel={`Open ${doc.name}`}
            factsLayout="inline"
            compactFacts={[doc.facts[0], doc.facts[1]]}
            trailing={
              editable && !doc.fixed ? (
                <Menu modal={false}>
                  <MenuTrigger asChild>
                    <IconButton icon="ellipsis" size="sm" aria-label={`Actions for ${doc.name}`} />
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={noop}>Rename</MenuItem>
                    <MenuSeparator />
                    <MenuItem tone="danger" onSelect={noop}>
                      Delete document
                    </MenuItem>
                  </MenuContent>
                </Menu>
              ) : undefined
            }
          />
        ))}
      </InformationList>
    </SupportSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Context                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function supportingFor(entry: ContextEntry): SemanticSupporting | undefined {
  if (entry.problem === 'missing' && entry.artifact) {
    return {
      text: `Awaited: ${entry.ref} is created earlier in the process.${
        entry.required ? ' Needed when the step starts.' : ''
      }`,
      icon: 'clock',
    };
  }

  if (entry.problem === 'missing') {
    return {
      text: `Not found: ${entry.ref} was moved or deleted. Required, so the next step cannot start until you replace or remove it.`,
      tone: 'danger',
      icon: 'circle-alert',
    };
  }

  if (entry.problem === 'superseded') {
    return {
      text: `Superseded by ${entry.replacement}. Optional, so the next step skips it.`,
      tone: 'attention',
      icon: 'triangle-alert',
    };
  }

  const parts = [entry.ref, entry.detail, entry.note].filter(Boolean);

  return parts.length > 0 ? { text: parts.join(' · ') } : undefined;
}

function EntryMenu({ entry, open }: { entry: ContextEntry; open?: boolean }) {
  const [required, setRequired] = useState(entry.required ? 'required' : 'optional');

  return (
    <Menu modal={false} defaultOpen={open}>
      <MenuTrigger asChild>
        <IconButton icon="ellipsis" size="sm" aria-label={`Actions for ${entry.name}`} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>When the step starts</MenuLabel>
        <MenuRadioGroup value={required} onValueChange={setRequired}>
          <MenuRadioItem value="required">Required</MenuRadioItem>
          <MenuRadioItem value="optional">Optional</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={noop}>Edit note</MenuItem>
        {entry.problem || entry.kind !== 'instructions' ? (
          <MenuItem onSelect={noop}>Replace</MenuItem>
        ) : null}
        <MenuItem onSelect={noop}>Move up</MenuItem>
        <MenuItem onSelect={noop}>Move down</MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={noop}>
          Remove from context
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function AddContextMenu({ open }: { open?: boolean }) {
  return (
    <Menu modal={false} defaultOpen={open}>
      {/* No Tooltip around a menu trigger: nested asChild triggers swallow taps on touch. */}
      <MenuTrigger asChild>
        <IconButton icon="plus" size="sm" variant="ghost" aria-label="Add context" />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem leadingIcon="file" onSelect={noop}>
          Specification document
        </MenuItem>
        <MenuItem leadingIcon="book-open" onSelect={noop}>
          Project document
        </MenuItem>
        <MenuItem leadingIcon="folder" onSelect={noop}>
          Code path
        </MenuItem>
        <MenuItem leadingIcon="info" onSelect={noop}>
          Instructions
        </MenuItem>
        <MenuItem leadingIcon="filter" onSelect={noop}>
          Where to change
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function TaskContextSection({
  entries,
  editable,
  menuOpen,
  rowMenuFor,
  collapsible = false,
  showAll: showAllInitially = false,
}: {
  entries: readonly ContextEntry[];
  editable: boolean;
  menuOpen?: boolean;
  rowMenuFor?: string;
  collapsible?: boolean;
  /** Story control: start with every entry shown. */
  showAll?: boolean;
}) {
  // Entries that need attention lead (missing, broken, awaited but required); the rest wait
  // behind "Show all", which shows every entry in its declared order. Same at every width.
  const needsAttention = entries.filter(
    (entry) => entry.problem === 'missing' && (entry.required || !entry.artifact),
  );
  const [showAll, setShowAll] = useState(showAllInitially || needsAttention.length === 0);
  const visible = showAll ? entries : needsAttention;
  const blocking = entries.filter(
    (entry) => entry.problem === 'missing' && entry.required && !entry.artifact,
  );
  // Collapsed on Narrow unless it holds a blocker.
  const expanded = blocking.length > 0;

  return (
    <SupportSection
      id="task-context-heading"
      title="Context"
      icon="book-open"
      count={`${entries.length} entries`}
      actions={editable ? <AddContextMenu open={menuOpen} /> : undefined}
      collapsible={collapsible}
      defaultExpanded={expanded}
    >
      <div className="grid gap-3">
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          Inputs this task needs before it starts, in the order they are read. task.md always comes
          first.
        </Typography>
        {blocking.length > 0 ? (
          <InlineNote tone="danger" role="alert">
            <span className="font-medium text-content-primary">
              {blocking.length} required entry is missing.
            </span>{' '}
            The next step cannot start until it is replaced or removed.
          </InlineNote>
        ) : null}
        <InformationList>
          {visible.map((entry) => (
            <OperationalRow
              key={entry.key}
              primary={
                entry.kind === 'path' || entry.kind === 'path-hint' ? (
                  <span className={entry.kind === 'path' ? 'font-mono text-body-sm' : undefined}>
                    {entry.name}
                  </span>
                ) : (
                  entry.name
                )
              }
              // Opens the referenced target (document preview, matched files, or the entry itself).
              onPrimaryClick={noop}
              factsLayout="inline"
              compactFacts={
                entry.artifact
                  ? [
                      kindLabel[entry.kind],
                      entry.required ? 'Required' : 'Optional',
                      'Process artifact',
                    ]
                  : [
                      kindLabel[entry.kind],
                      entry.locked ? 'Always first' : entry.required ? 'Required' : 'Optional',
                    ]
              }
              supporting={supportingFor(entry)}
              leading={
                <span className="flex items-center justify-center text-content-muted">
                  <Icon name={kindIcon[entry.kind]} size="sm" aria-hidden="true" />
                </span>
              }
              trailing={
                editable && !entry.locked ? (
                  <EntryMenu entry={entry} open={rowMenuFor === entry.key} />
                ) : undefined
              }
            />
          ))}
        </InformationList>
        {showAll && needsAttention.length > 0 ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
              Show only entries that need attention
            </Button>
          </div>
        ) : null}
        {!showAll ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              Show all {entries.length} entries in order
            </Button>
          </div>
        ) : null}
      </div>
    </SupportSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Add context dialogs                                                                          */
/* ------------------------------------------------------------------------------------------ */

function RequiredChoice() {
  const [value, setValue] = useState('required');

  return (
    <div className="grid gap-2">
      <Typography as="p" variant="label-sm" id="radio-when-the-step-starts">
        When the step starts
      </Typography>
      <RadioGroup
        value={value}
        onValueChange={setValue}
        aria-labelledby="radio-when-the-step-starts"
      >
        <RadioGroupOption
          value="required"
          label="Required"
          description="The step does not start while it is missing."
        />
        <RadioGroupOption
          value="optional"
          label="Optional"
          description="Skipped and listed as omitted when it is missing."
        />
      </RadioGroup>
    </div>
  );
}

function NoteField() {
  return (
    <Field>
      <Field.Label>Why it is needed (optional)</Field.Label>
      <TextInput placeholder="For example: the screens and states to keep" />
    </Field>
  );
}

export type AddContextKind = 'specification-document' | 'repository-document' | 'path';

/** The process-artifact option shared by the add dialogs (documents and paths). */
function ArtifactOption({ checked }: { checked: boolean }) {
  return (
    <CheckboxField
      label="Created earlier in the process (for example by another task)"
      description="Needed before this task starts. It may not exist yet; until then it shows as awaited, without a warning. What this task produces is not context: it is an exit gate of the step that produces it."
      defaultChecked={checked}
    />
  );
}

export function AddContextDialog({
  kind,
  artifact = false,
  refused = false,
}: {
  kind: AddContextKind;
  artifact?: boolean;
  /** The Engine refused: the entry is this task's own document. */
  refused?: boolean;
}) {
  const title =
    kind === 'specification-document'
      ? 'Add specification documents'
      : kind === 'repository-document'
        ? 'Add project documents'
        : 'Add a code path';
  let body: ReactNode;
  switch (kind) {
    case 'specification-document':
      body = artifact ? (
        // An artifact does not exist yet: name where it will be instead of picking it.
        <Field>
          <Field.Label>Document path in Single sign-on</Field.Label>
          <TextInput
            className="font-mono"
            defaultValue={refused ? 'tasks/T-04/findings.md' : 'notes/refresh-findings.md'}
          />
          <Field.Description>Not registered yet; shown as awaited until it is.</Field.Description>
        </Field>
      ) : (
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-label-sm text-content-primary">
            Documents of Single sign-on
          </legend>
          <CheckboxField
            label="Overview"
            description="overview.md · already in context"
            checked
            disabled
          />
          <CheckboxField label="UX" description="ux.md · already in context" checked disabled />
          <CheckboxField label="Requirements" description="requirements.md" defaultChecked />
          <CheckboxField label="Specification" description="specification.md" />
          <CheckboxField label="Backend" description="backend.md · file missing" disabled />
        </fieldset>
      );
      break;
    case 'repository-document':
      body = (
        <div className="grid gap-3">
          <Field>
            <Field.Label>Search project documentation</Field.Label>
            <TextInput defaultValue="return to previous route" />
          </Field>
          <fieldset className="grid gap-3">
            <legend className="sr-only">Results</legend>
            <CheckboxField
              label="UI interaction model"
              description="product.specflow.ui.interaction-model · already in context"
              checked
              disabled
            />
            <CheckboxField
              label="Secondary navigation"
              description="design-system.implementation.react.secondary-navigation · Back and pushed detail"
              defaultChecked
            />
            <CheckboxField
              label="SpecFlow UI data, loading and integration contract"
              description="product.specflow.ui.data-loading-and-integration"
            />
          </fieldset>
        </div>
      );
      break;
    case 'path':
      body = (
        <div className="grid gap-3">
          <Field>
            <Field.Label>File, folder or glob</Field.Label>
            <TextInput
              className="font-mono"
              defaultValue="packages/specflow-ui/src/features/auth/**"
            />
            <Field.Description>Relative to the repository root.</Field.Description>
          </Field>
          <InlineNote tone="info" role="status">
            Matches 9 files today. The list is resolved again when the step starts.
          </InlineNote>
        </div>
      );
      break;
  }

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Added to the end of T-04's context. You can reorder it later.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {refused ? (
            <Alert role="alert" tone="danger" title="Not added: this is the task's own document">
              Context lists what T-04 needs before it starts. A document T-04 produces belongs to an
              exit gate of the step that produces it, for example “a findings document exists”
              before finishing.
            </Alert>
          ) : null}
          {/* First: it decides whether the item is picked (exists) or named (created later). */}
          <ArtifactOption checked={artifact} />
          {body}
          <RequiredChoice />
          <NoteField />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Add to context</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Dependencies                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function dependencySupporting(other: MockTask): SemanticSupporting {
  if (other.workflow.position.kind === 'terminal') {
    return { text: 'Completed', tone: 'success', icon: 'circle-check' };
  }

  if (other.status === 'draft') {
    return { text: 'Draft · needs approval', tone: 'attention', icon: 'triangle-alert' };
  }

  if (other.workflow.position.kind === 'active') {
    return {
      text: `${stepTitle(other.workflow.position.step)} · in progress`,
      tone: 'info',
      icon: 'workflow',
    };
  }

  return { text: 'Not finished', icon: 'clock' };
}

export function TaskDependenciesSection({
  item,
  editable,
  collapsible = false,
}: {
  item: MockTask;
  editable: boolean;
  collapsible?: boolean;
}) {
  const dependencies = tasks.filter((other) => item.dependsOn.includes(other.id));
  const locked = item.started;
  const expanded = false;
  if (dependencies.length === 0 && !editable) {
    return null;
  }

  return (
    <SupportSection
      id="task-dependencies-heading"
      title="Depends on"
      icon="network"
      count={dependencies.length > 0 ? dependencies.length : undefined}
      actions={
        editable && !locked && dependencies.length > 0 ? (
          <SectionAddButton label="Add dependency" />
        ) : undefined
      }
      collapsible={collapsible}
      defaultExpanded={expanded}
    >
      <div className="grid gap-3">
        {dependencies.length === 0 ? (
          <>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              No dependencies: the task can start as soon as it is approved.
            </Typography>
            <SectionCallToAction label="Add dependency" />
          </>
        ) : null}
        {locked ? (
          <InlineNote tone="info">Dependencies are fixed once the task has started.</InlineNote>
        ) : null}
        <InformationList>
          {dependencies.map((other) => (
            <OperationalRow
              key={other.id}
              primary={other.title}
              onPrimaryClick={noop}
              compactFacts={[{ text: other.id, mono: true }, typeOf(other).title]}
              supporting={dependencySupporting(other)}
              trailing={
                editable && !locked ? (
                  <Menu modal={false}>
                    <MenuTrigger asChild>
                      <IconButton
                        icon="ellipsis"
                        size="sm"
                        aria-label={`Actions for ${other.id}`}
                      />
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuItem tone="danger" onSelect={noop}>
                        Remove dependency
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                ) : undefined
              }
            />
          ))}
        </InformationList>
      </div>
    </SupportSection>
  );
}

export function AddDependencyDialog({ item }: { item: MockTask }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add dependencies to {item.id}</DialogTitle>
          <DialogDescription>
            {item.id} becomes ready only when these tasks are done.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <fieldset className="grid gap-3">
            <legend className="sr-only">Tasks</legend>
            <CheckboxField label="T-01 · Evaluate identity provider SDKs" description="Done" />
            <CheckboxField
              label="T-02 · Token exchange endpoint and session cookie"
              description="Already a dependency"
              checked
              disabled
            />
            <CheckboxField
              label="T-03 · Sign-in button and provider redirect"
              description="Already a dependency"
              checked
              disabled
            />
            <CheckboxField
              label="T-05 · Audit log of sign-in events"
              description="On hold"
              defaultChecked
            />
            <CheckboxField
              label="T-07 · Rate-limit session refresh"
              description="T-07 already depends on T-04; adding it would create a cycle"
              disabled
            />
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Add dependencies</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
