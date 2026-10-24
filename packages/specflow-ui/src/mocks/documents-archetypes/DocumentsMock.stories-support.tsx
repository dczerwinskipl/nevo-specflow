import { useId, useState, type ReactNode } from 'react';
import {
  Alert,
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  Button,
  Collapsible,
  DescriptionList,
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
  InlineNote,
  ItemTabs,
  MarkdownDocument,
  Menu,
  MenuContent,
  MenuItem,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
  RadioGroup,
  RadioGroupOption,
  ScrollArea,
  Separator,
  Spinner,
  TextInput,
  TooltipProvider,
  Typography,
  WorkspaceHeader,
  cn,
  treeBranchClassName,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRequiredLabelClassName,
  treeRootClassName,
  treeRowActionClassName,
  treeRowClassName,
  type ItemTab,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { MockNavigation } from '../editor-mode/MockNavigation.stories-support';
import {
  documentTypes,
  fileName,
  ownerFeature,
  specTitle,
  stem,
  treeDocuments,
  treeFolders,
  typeTitle,
  type MockDocument,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/documents-archetypes-ui.md).
 * Static data, no routing, no backend, no editor engine. Not responsive: each story pins one frame
 * width. It uses the real AppShell / AppWorkspace / WorkspaceHeader / ItemTabs and tree recipes so the
 * geometry is the product's; the tree rows and the panels are hand-composed.
 */

export type DocumentsScenario =
  | 'overview'
  | 'clean'
  | 'read-only-tree'
  | 'new-document'
  | 'assign-type'
  | 'row-menu'
  | 'read-only'
  | 'saving'
  | 'conflict'
  | 'image'
  | 'binary'
  | 'dangling';

export interface DocumentsMockProps {
  width: number;
  height?: number;
  scenario: DocumentsScenario;
  /** Narrow only: which stacked page is visible. */
  narrowPage?: 'tree' | 'document';
}

const WIDE_SHELL_MIN_WIDTH = 1108;
const noop = () => undefined;

/* ------------------------------------------------------------------------------------------ */
/* Tree                                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** The trailing quiet label of a row: the type when the file name does not already say it. */
function trailingLabel(
  doc: MockDocument,
): { text: string; tone?: 'attention'; state?: boolean } | undefined {
  // State labels never hide (the name truncates instead); only a type title may hide on narrow rows.
  if (doc.state === 'dangling') return { text: 'File missing', tone: 'attention', state: true };
  if (doc.state === 'unclassified') return { text: 'No type', state: true };
  if (doc.type && stem(doc.path) !== doc.type) return { text: typeTitle(doc.type) };
  return undefined;
}

function RowMenu({ doc, open }: { doc: MockDocument; open?: boolean }) {
  const name = fileName(doc.path);
  const noteId = useId();
  const reason = doc.protected
    ? 'The overview is the main document: it can be edited, but not renamed, moved or deleted.'
    : undefined;
  return (
    <Menu modal={false} defaultOpen={open}>
      <MenuTrigger asChild>
        <IconButton
          className={treeRowActionClassName}
          icon="ellipsis"
          size="sm"
          aria-label={`Actions for ${name}`}
        />
      </MenuTrigger>
      <MenuContent align="end" aria-describedby={reason ? noteId : undefined}>
        {doc.protected ? null : doc.state === 'dangling' ? (
          <MenuItem tone="danger" onSelect={noop}>
            Remove registration
          </MenuItem>
        ) : (
          <>
            {doc.state === 'unclassified' && (
              <>
                <MenuItem onSelect={noop}>Assign type…</MenuItem>
                <MenuSeparator />
              </>
            )}
            <MenuItem onSelect={noop}>Rename</MenuItem>
            <MenuItem onSelect={noop}>Move</MenuItem>
            <MenuItem tone="danger" onSelect={noop}>
              Delete
            </MenuItem>
          </>
        )}
        {reason && <MenuNote id={noteId}>{reason}</MenuNote>}
      </MenuContent>
    </Menu>
  );
}

function DocRow({
  doc,
  selected,
  menuOpen,
  onOpen,
}: {
  doc: MockDocument;
  selected: boolean;
  menuOpen?: boolean;
  onOpen: () => void;
}) {
  const label = trailingLabel(doc);
  const missing = doc.state === 'dangling';
  const glyph = missing ? 'triangle-alert' : 'file';
  return (
    <li className={treeNodeClassName}>
      <div className={treeRowClassName}>
        <button
          type="button"
          className={treeLeafItemClassName}
          aria-current={selected ? 'true' : undefined}
          onClick={onOpen}
        >
          <Icon name={glyph} className={cn(missing && 'text-status-attention')} />
          <span
            className={cn(treeItemLabelTruncateClassName, missing && 'text-content-muted')}
            title={doc.path}
          >
            {fileName(doc.path)}
          </span>
          {label && (
            <span
              className={cn(
                label.state
                  ? 'shrink-0 self-center whitespace-nowrap text-body-sm text-content-muted'
                  : treeRequiredLabelClassName,
                label.tone === 'attention' && 'text-status-attention',
              )}
            >
              {label.text}
            </span>
          )}
        </button>
        <RowMenu doc={doc} open={menuOpen} />
      </div>
    </li>
  );
}

function Tree({
  active,
  menuFor,
  onOpen,
}: {
  active?: string;
  menuFor?: string;
  onOpen: (id: string) => void;
}) {
  const level = (parent: string) => {
    const docs = treeDocuments
      .filter((doc) => (doc.path.includes('/') ? doc.path.split('/')[0] : '') === parent)
      .sort((a, b) => fileName(a.path).localeCompare(fileName(b.path)));
    return docs.map((doc) => (
      <DocRow
        key={doc.id}
        doc={doc}
        selected={doc.id === active}
        menuOpen={doc.id === menuFor}
        onOpen={() => onOpen(doc.id)}
      />
    ));
  };
  return (
    <TooltipProvider>
      <ul className={treeRootClassName} aria-label="Documents">
        {treeFolders.map((folder) => (
          <li key={folder} className={treeNodeClassName}>
            <div className={treeRowClassName}>
              <button type="button" className={treeItemClassName} aria-expanded="true">
                <span className={treeGlyphSlotClassName}>
                  <Icon name="chevron-down" />
                </span>
                <Icon name="folder" />
                <span className={treeItemLabelTruncateClassName}>{folder}</span>
              </button>
              <IconButton
                className={treeRowActionClassName}
                icon="ellipsis"
                size="sm"
                aria-label={`Actions for ${folder}`}
              />
            </div>
            <ul className={treeBranchClassName}>{level(folder)}</ul>
          </li>
        ))}
        {level('')}
      </ul>
    </TooltipProvider>
  );
}

/** Unmet requirements only; met ones stay quiet (structure, not approval). */
function ExpectedDocuments({
  onAdd,
  canAdd,
}: {
  onAdd: (type: string) => void;
  /** capabilities.createFile.available: without it the row stays as information only. */
  canAdd: boolean;
}) {
  return (
    <section aria-labelledby="expected-heading" className="grid gap-1 px-2">
      <Typography as="h2" id="expected-heading" variant="label-sm">
        Expected documents
      </Typography>
      <Typography as="p" variant="body-sm" className="text-content-muted">
        {ownerFeature.title} expects these types. Only file presence is checked.
      </Typography>
      <ul className="grid">
        <li className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body-md text-content-secondary">Decisions</span>
          <span className="shrink-0 text-body-sm text-content-muted">0 of 1</span>
          {canAdd && (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon="plus"
              className="ml-auto"
              aria-label="Add a Decisions document"
              onClick={() => onAdd('decisions')}
            >
              Add
            </Button>
          )}
        </li>
      </ul>
    </section>
  );
}

function CloseIssues() {
  return (
    <Alert tone="attention" title="Closing this specification will be refused">
      <ul className="grid list-disc gap-1 pl-4 text-body-sm">
        <li>Two files differ only in letter case: notes/meeting-2026-10-20.md</li>
      </ul>
      <p className="mt-2 text-body-sm text-content-secondary">
        Fix this in the folder (for example with Git), then refresh.
      </p>
    </Alert>
  );
}

function TreePanel({
  scenario,
  active,
  onOpen,
  onAdd,
}: {
  scenario: DocumentsScenario;
  active?: string;
  onOpen: (id: string) => void;
  onAdd: (type: string) => void;
}) {
  const clean = scenario === 'clean';
  const readOnly = scenario === 'read-only-tree' || scenario === 'read-only';
  return (
    <AppContent className="h-full w-full">
      <ScrollArea direction="both" className="min-h-0 flex-1" contentClassName="grid gap-4 p-2">
        <p className="px-2 text-body-sm text-content-muted">Single sign-on · Documents</p>
        {readOnly && (
          <InlineNote className="px-2">
            Editing is unavailable: this branch is protected from SpecFlow commits.
          </InlineNote>
        )}
        {!clean && !readOnly && scenario === 'overview' && <CloseIssues />}
        {!clean && <ExpectedDocuments onAdd={onAdd} canAdd={!readOnly} />}
        {!clean && <Separator />}
        <Tree
          active={active}
          menuFor={scenario === 'row-menu' ? 'overview' : undefined}
          onOpen={onOpen}
        />
        {scenario === 'overview' && (
          // skipped-entry: neutral information, not a Close refusal (contract gap G10).
          <p className="px-2 text-body-sm text-content-muted">
            1 entry in the folder could not be read.
          </p>
        )}
      </ScrollArea>
    </AppContent>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* New document / Assign type                                                                  */
/* ------------------------------------------------------------------------------------------ */

const suggestedTypes = ownerFeature.documents
  .filter((template) => template.include === 'optional')
  .map((template) => template.type);
const otherTypes = documentTypes
  .map((type) => type.id)
  .filter((id) => id !== 'overview' && !suggestedTypes.includes(id));
const presentCount: Record<string, number> = { behaviour: 1, ux: 2, note: 1 };

function TypeOption({ id }: { id: string }) {
  const type = documentTypes.find((item) => item.id === id)!;
  const expected = ownerFeature.requirements.find((r) => r.documentType === id);
  const count = presentCount[id] ?? 0;
  return (
    <RadioGroupOption
      value={id}
      label={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{type.title}</span>
          {expected && count < expected.minCount ? (
            <span className="text-body-sm font-normal text-content-muted">
              Expected · {count} of {expected.minCount}
            </span>
          ) : count > 0 ? (
            <span className="text-body-sm font-normal text-content-muted">
              {count} in this specification
            </span>
          ) : null}
        </span>
      }
      description={type.useWhen}
    />
  );
}

function TypeChoice({
  value,
  onChange,
  allowNone,
}: {
  value: string;
  onChange: (value: string) => void;
  allowNone: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      aria-label="Document type"
      className="grid gap-4"
    >
      <Typography as="p" variant="label-sm">
        Suggested by {ownerFeature.title}
      </Typography>
      {suggestedTypes.map((id) => (
        <TypeOption key={id} id={id} />
      ))}
      <Typography as="p" variant="label-sm" className="mt-2">
        Other types
      </Typography>
      {otherTypes.map((id) => (
        <TypeOption key={id} id={id} />
      ))}
      {allowNone && (
        <RadioGroupOption
          value=""
          label="No type"
          description="Counts as no type. You can assign one later."
        />
      )}
    </RadioGroup>
  );
}

function Guidance({ type }: { type: string }) {
  const info = documentTypes.find((item) => item.id === type);
  if (!info) return null;
  return (
    <Collapsible className="-ml-control-padding-compact">
      <Collapsible.Trigger className="px-0">
        How to write a {info.title} document
      </Collapsible.Trigger>
      <Collapsible.Content>
        <p className="text-body-sm text-content-secondary">{info.instructions}</p>
      </Collapsible.Content>
    </Collapsible>
  );
}

/** One Dialog at every width (it fits 390); only md/txt are offered (capabilities.formats). */
function NewDocumentDialog({ initialType = 'decisions' }: { initialType?: string }) {
  const [type, setType] = useState(initialType);
  const filename = documentTypes.find((item) => item.id === type)?.defaultFilename ?? 'untitled.md';
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>In the main folder of {specTitle}.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <TypeChoice value={type} onChange={setType} allowNone />
          <Field>
            <Field.Label>File name</Field.Label>
            <TextInput defaultValue={filename} key={filename} />
            <Field.Description>
              The type decides what the document counts as; the name is free.
            </Field.Description>
          </Field>
          <Guidance type={type} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignTypeDialog() {
  const [type, setType] = useState('research');
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a type</DialogTitle>
          <DialogDescription>
            notes/meeting-2026-10-20.md stays where it is. Its type decides what it counts as in
            this specification.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <TypeChoice value={type} onChange={setType} allowNone={false} />
          <Guidance type={type} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Assign type</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Document area                                                                               */
/* ------------------------------------------------------------------------------------------ */

const markdown = `# Single sign-on

## Context

Employees sign in through the corporate identity provider, without an extra password.

## Goal

Return the user to the project they had open before authentication.

## Acceptance Criteria & Verification

1. A user without a provider account sees an explanation, not a raw error.
2. Token verification failures are logged with a correlation id.
`;

const uxSource = `# Single sign-on - UX

## Flows

1. The user chooses "Sign in with Acme ID".
2. The provider page opens in the same tab.
3. After consent the user returns to the project they had open.

## Screens and states

- Sign-in: idle, redirecting, provider error.
`;

interface TabSpec {
  tabs: ItemTab[];
  active: string;
}

function tabsFor(scenario: DocumentsScenario): TabSpec {
  const tab = (id: string, extra: Partial<ItemTab> = {}): ItemTab => {
    const doc = treeDocuments.find((item) => item.id === id)!;
    return {
      id,
      // Today's rule (documentTabs.ts): the tab label is the file name; the title is the heading.
      label: fileName(doc.path),
      description: doc.path,
      icon: 'file',
      ...extra,
    };
  };
  switch (scenario) {
    case 'read-only':
      return { tabs: [tab('overview'), tab('behaviour')], active: 'overview' };
    case 'saving':
    case 'conflict':
      return { tabs: [tab('overview'), tab('ux', { dirty: true })], active: 'ux' };
    case 'image':
      return { tabs: [tab('overview'), tab('diagram')], active: 'diagram' };
    case 'binary':
      return {
        tabs: [tab('overview'), tab('u-notes-token-sample-bin')],
        active: 'u-notes-token-sample-bin',
      };
    case 'dangling':
      return { tabs: [tab('overview'), tab('backend', { state: 'missing' })], active: 'backend' };
    default:
      return { tabs: [], active: '' };
  }
}

function headerActions(scenario: DocumentsScenario): WorkspaceHeaderAction[] {
  const path = {
    id: 'path',
    label: 'Show path',
    icon: 'info',
    group: 'actions',
    onPress: noop,
  } as const;
  const close = {
    id: 'close',
    label: 'Close tab',
    icon: 'close',
    group: 'actions',
    onPress: noop,
  } as const;
  switch (scenario) {
    case 'saving':
    case 'conflict':
      return [
        {
          id: 'preview',
          label: 'Preview',
          icon: 'eye',
          presentation: 'icon',
          group: 'actions',
          direct: 'wide',
          onPress: noop,
        },
        {
          id: 'save',
          label: scenario === 'saving' ? 'Saving…' : 'Save',
          icon: 'save',
          primary: true,
          direct: 'always',
          group: 'actions',
          // Conflict: unavailable until the user copies their version or loads the one on disk.
          disabled: true,
          shortcut: 'Ctrl+S',
          onPress: noop,
        },
        {
          id: 'discard',
          label: 'Discard changes',
          icon: 'close',
          group: 'actions',
          disabled: scenario === 'saving',
          onPress: noop,
        },
        path,
        close,
      ];
    case 'image':
      return [
        { id: 'actual', label: 'Actual size', group: 'display', checked: false, onPress: noop },
        { id: 'download', label: 'Download', direct: 'always', group: 'actions', onPress: noop },
        path,
        close,
      ];
    case 'binary':
      return [
        { id: 'download', label: 'Download', direct: 'always', group: 'actions', onPress: noop },
        path,
        close,
      ];
    case 'read-only':
    case 'dangling':
      return [path, close];
    default:
      return [path, close];
  }
}

function SourceBlock({ source }: { source: string }) {
  const lines = source.split('\n');
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 px-4 py-3 font-mono text-body-sm">
      {lines.map((line, index) => (
        <div key={index} className="contents">
          <span className="select-none text-right text-content-muted">{index + 1}</span>
          <span className="whitespace-pre-wrap text-content-primary">{line || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentBody({ scenario }: { scenario: DocumentsScenario }) {
  switch (scenario) {
    case 'read-only':
      return (
        <div className="grid gap-4 p-6">
          <InlineNote>
            Read-only: this branch is protected from SpecFlow commits. To edit, open the
            specification in a workspace on an allowed branch.
          </InlineNote>
          <div className="max-w-content-narrow">
            <MarkdownDocument source={markdown} />
          </div>
        </div>
      );
    case 'saving':
      return <SourceBlock source={uxSource} />;
    case 'conflict':
      return (
        <div className="grid gap-0">
          <div className="p-4 pb-0">
            <Alert
              role="alert"
              tone="attention"
              title="Not saved: ux.md changed on disk"
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Copy my version
                  </Button>
                  <Button size="sm" variant="secondary">
                    Load the version on disk…
                  </Button>
                </>
              }
            >
              <p>
                The file was changed outside this editor after you opened it. Nothing was
                overwritten and your changes are still here.
              </p>
            </Alert>
          </div>
          <SourceBlock source={uxSource} />
        </div>
      );
    case 'image':
      return (
        <div className="grid min-h-0 flex-1 place-items-center p-4">
          <div
            role="img"
            aria-label="sequence.png (placeholder for the image loaded from the raw endpoint)"
            className="grid w-full place-items-center bg-surface-subtle text-body-sm text-content-muted"
            style={{ aspectRatio: '16 / 9', maxHeight: '100%' }}
          >
            sequence.png · Fit
          </div>
        </div>
      );
    case 'binary':
      return (
        <div className="grid max-w-content-narrow gap-4 p-6">
          <Typography as="p" variant="body-md" className="text-content-secondary">
            This file cannot be shown here. Download it to open it in another program.
          </Typography>
          <DescriptionList aria-label="File information">
            {[
              ['Path', 'notes/token-sample.bin'],
              ['Type', 'No type'],
              ['Size', '14.2 KB'],
              ['Format', 'application/octet-stream'],
            ].map(([term, detail]) => (
              <DescriptionList.Item key={term}>
                <DescriptionList.Term>{term}</DescriptionList.Term>
                <DescriptionList.Detail emphasis="secondary">{detail}</DescriptionList.Detail>
              </DescriptionList.Item>
            ))}
          </DescriptionList>
          <div>
            <Button variant="secondary">Download</Button>
          </div>
        </div>
      );
    case 'dangling':
      return (
        <div className="p-4">
          <Alert
            tone="attention"
            title="backend.md is missing"
            actions={
              <Button size="sm" variant="secondary">
                Remove registration
              </Button>
            }
          >
            <p>
              The specification lists backend.md as a Backend document, but the file is not in the
              folder. It may have been moved or deleted outside SpecFlow.
            </p>
            <p className="mt-1 text-content-secondary">
              To keep it, restore the file (for example with Git) and refresh.
            </p>
          </Alert>
        </div>
      );
    default:
      return null;
  }
}

function EmptyDocumentArea({ onOpen }: { onOpen: (id: string) => void }) {
  const start = treeDocuments.filter((doc) => doc.state === 'registered').slice(0, 5);
  return (
    <div className="flex h-full min-h-0 max-w-content-narrow flex-col gap-4 p-6">
      <Typography as="p" variant="title-sm">
        Choose a document from the tree
      </Typography>
      <ul aria-label="Start with" className="flex flex-col items-start gap-1">
        {start.map((doc) => (
          <li key={doc.id}>
            <Button
              variant="ghost"
              leadingIcon="file"
              title={doc.path}
              onClick={() => onOpen(doc.id)}
            >
              {fileName(doc.path)}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const tabLabels = {
  tablist: 'Open documents',
  openedMenu: (n: number) => `Opened (${n})`,
  switcher: ({ label, count }: { label: string; count: number }) => `${label} (${count})`,
};

/* ------------------------------------------------------------------------------------------ */
/* Workspace                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function Workspace({ scenario, narrowPage }: DocumentsMockProps) {
  const spec = tabsFor(scenario);
  const [dialogType, setDialogType] = useState<string | undefined>(
    scenario === 'new-document' ? 'decisions' : undefined,
  );
  const hasTabs = spec.tabs.length > 0;
  const showDocument = hasTabs && narrowPage !== 'tree';
  const rootActions: WorkspaceHeaderAction[] = [
    {
      id: 'new-document',
      label: 'New document…',
      icon: 'plus',
      direct: 'wide',
      presentation: 'icon',
      disabled: scenario === 'read-only-tree' || scenario === 'read-only',
      onPress: () => setDialogType('decisions'),
    },
    { id: 'new-folder', label: 'New folder', icon: 'folder', onPress: noop },
    { id: 'upload', label: 'Upload files', onPress: noop },
  ];
  const savingStatus =
    scenario === 'saving' ? (
      <span className="flex items-center gap-1 text-body-sm text-content-muted">
        <Spinner size="sm" /> Saving and committing…
      </span>
    ) : undefined;
  if (narrowPage === 'document')
    // Narrow stacked document page, hand-composed: the product shows it as the Secondary stack
    // screen (Back in the header, `name (N)` switcher, complete menu).
    return (
      <AppWorkspaceProvider scopeKey="documents-archetypes-mock">
        <AppWorkspace scroll="content" fit="available">
          <AppWorkspace.Primary
            header={
              <WorkspaceHeader
                actions={headerActions(scenario)}
                menu="complete"
                title={spec.tabs.find((tab) => tab.id === spec.active)?.label ?? ''}
                labels={{
                  moreActions: 'More actions',
                  menuActions: 'Actions',
                  menuDisplay: 'Display',
                }}
                identityContent={
                  <ItemTabs
                    items={spec.tabs}
                    activeId={spec.active}
                    onActivate={noop}
                    onClose={noop}
                    scope="documents-archetypes-mock"
                    variant="switcher"
                    labels={tabLabels}
                  />
                }
              />
            }
          >
            <AppContent className="h-full w-full">
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-4 pt-3">
                  <Button variant="ghost" size="sm">
                    Back to documents
                  </Button>
                </div>
                <DocumentBody scenario={scenario} />
              </ScrollArea>
            </AppContent>
          </AppWorkspace.Primary>
        </AppWorkspace>
      </AppWorkspaceProvider>
    );
  return (
    <AppWorkspaceProvider scopeKey="documents-archetypes-mock">
      <AppWorkspace
        scroll="content"
        fit="available"
        stackedSecondaryClose="hide"
        primaryMaxPx={360}
        split="secondary"
        labels={{ backToPrimary: 'Back to documents', closeSecondary: 'Close all documents' }}
      >
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title="Documents"
              actions={rootActions}
              labels={{ moreActions: 'More actions' }}
            />
          }
        >
          <TreePanel
            scenario={scenario}
            active={spec.active || undefined}
            onOpen={noop}
            onAdd={(type) => setDialogType(type)}
          />
        </AppWorkspace.Primary>
        {showDocument ? (
          <AppWorkspace.Secondary
            open
            header={
              <WorkspaceHeader
                actions={headerActions(scenario)}
                menu="complete"
                headingLevel={2}
                status={savingStatus}
                title={spec.tabs.find((tab) => tab.id === spec.active)?.label ?? ''}
                labels={{
                  moreActions: 'More actions',
                  menuActions: 'Actions',
                  menuDisplay: 'Display',
                }}
                identityContent={
                  <ItemTabs
                    items={spec.tabs}
                    activeId={spec.active}
                    onActivate={noop}
                    onClose={noop}
                    scope="documents-archetypes-mock"
                    labels={tabLabels}
                  />
                }
              />
            }
          >
            <AppContent className="h-full w-full">
              <ScrollArea className="min-h-0 flex-1">
                <DocumentBody scenario={scenario} />
              </ScrollArea>
            </AppContent>
          </AppWorkspace.Secondary>
        ) : narrowPage === undefined ? (
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Document" />}>
            <EmptyDocumentArea onOpen={noop} />
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
      {dialogType && <NewDocumentDialog initialType={dialogType} />}
      {scenario === 'assign-type' && <AssignTypeDialog />}
    </AppWorkspaceProvider>
  );
}

export function DocumentsMock(props: DocumentsMockProps): ReactNode {
  const { width, height = 900 } = props;
  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<MockNavigation />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Specification navigation' }}
        >
          <Workspace key={JSON.stringify(props)} {...props} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}

export const wideShellMinWidth = WIDE_SHELL_MIN_WIDTH;
