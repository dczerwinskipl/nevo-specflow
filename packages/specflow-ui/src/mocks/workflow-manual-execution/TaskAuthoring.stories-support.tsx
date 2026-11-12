import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Button,
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
import { tasks, typeOf, type MockTask } from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY. Task authoring beyond task.md: the Task's own documents, its context list
 * (F20 entry kinds) and its dependencies. Structured facts are edited where they are read, in the
 * Task page sections (header Add + row menu); documents open in the Secondary editor.
 */

const noop = () => undefined;
type IconName = ComponentProps<typeof Icon>['name'];

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

/* ------------------------------------------------------------------------------------------ */
/* Documents                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function TaskDocumentsSection({ editable }: { editable: boolean }) {
  return (
    <WorkspaceSection aria-labelledby="task-documents-heading">
      <WorkspaceSection.Header
        id="task-documents-heading"
        title="Documents"
        icon="file"
        count={2}
        actions={editable ? <SectionAddButton label="New document" /> : undefined}
      />
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
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Context                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function supportingFor(entry: ContextEntry): SemanticSupporting | undefined {
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
}: {
  entries: readonly ContextEntry[];
  editable: boolean;
  menuOpen?: boolean;
  rowMenuFor?: string;
}) {
  const blocking = entries.filter((entry) => entry.problem === 'missing' && entry.required);

  return (
    <WorkspaceSection aria-labelledby="task-context-heading">
      <WorkspaceSection.Header
        id="task-context-heading"
        title="Context"
        icon="book-open"
        count={`${entries.length} entries`}
        actions={editable ? <AddContextMenu open={menuOpen} /> : undefined}
      />
      <div className="grid gap-3">
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          What the person or agent doing a step reads, in this order. task.md always comes first.
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
          {entries.map((entry) => (
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
              compactFacts={[
                kindLabel[entry.kind],
                entry.locked ? 'Always first' : entry.required ? 'Required' : 'Optional',
              ]}
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
      </div>
    </WorkspaceSection>
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

export function AddContextDialog({ kind }: { kind: AddContextKind }) {
  const title =
    kind === 'specification-document'
      ? 'Add specification documents'
      : kind === 'repository-document'
        ? 'Add project documents'
        : 'Add a code path';
  let body: ReactNode;
  switch (kind) {
    case 'specification-document':
      body = (
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
      text: `${other.workflow.position.step} · attempt ${other.workflow.position.attempt} · in progress`,
      tone: 'info',
      icon: 'workflow',
    };
  }

  return { text: 'Not finished', icon: 'clock' };
}

export function TaskDependenciesSection({ item, editable }: { item: MockTask; editable: boolean }) {
  const dependencies = tasks.filter((other) => item.dependsOn.includes(other.id));
  const locked = item.started;
  if (dependencies.length === 0 && !editable) {
    return null;
  }

  return (
    <WorkspaceSection aria-labelledby="task-dependencies-heading">
      <WorkspaceSection.Header
        id="task-dependencies-heading"
        title="Depends on"
        icon="network"
        count={dependencies.length > 0 ? dependencies.length : undefined}
        actions={
          editable && !locked && dependencies.length > 0 ? (
            <SectionAddButton label="Add dependency" />
          ) : undefined
        }
      />
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
    </WorkspaceSection>
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
