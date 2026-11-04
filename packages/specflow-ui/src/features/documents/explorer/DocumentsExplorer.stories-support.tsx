import {
  documentContentFixture,
  documentTreeFixture,
  saveResultFixture,
} from '../../../../test-support/documents/fixtures';
import type { DocumentContent, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  AppContent,
  WorkspaceHeader,
  WorkspaceHeaderIdentity,
  type WorkspaceHeaderAction,
  defineSecondaryStack,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  type SecondaryData,
} from '@nevo/ui';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { DocumentsExplorer, type DocumentOperation } from './DocumentsExplorer';
import { documentRootActions, type DocumentTreeController } from './documentRootActions';
import { DocumentEditor } from '../editor/DocumentEditor';
import { DocumentEditorProvider, useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { useTranslation } from 'react-i18next';
import type { NewDocumentEntry } from './useDocumentOperations';
const no = { available: false, reason: 'protected' } as const;
export const protectedActions = {
  rename: no,
  move: no,
  delete: no,
  classify: { available: false },
};
const initialTree: Tree = documentTreeFixture({
  folders: ['notes', '__root'],
  documents: [
    { id: 'specification', path: 'specification.md', protected: true, actions: protectedActions },
    { id: 'decisions', path: 'notes/decisions.md' },
  ],
});
const specification: DocumentContent = documentContentFixture({
  id: 'specification',
  title: 'Specification',
  path: 'specification.md',
  revision: '1',
  content:
    '# Logowanie SSO\n\n## Cel\n\nPracownicy logują się przez firmowego dostawcę tożsamości, bez dodatkowego hasła.\n\n## Zachowanie\n\nPo uwierzytelnieniu użytkownik wraca do poprzednio otwartego projektu.\n\n## Kryteria akceptacji\n\n- Odpowiedź dostawcy jest weryfikowana.\n- Anulowanie nie tworzy sesji.\n- Użytkownik może bezpiecznie się wylogować.',
});
const Records = createContext<Record<string, DocumentContent>>({});
interface StackData {
  record: DocumentContent;
  actions: readonly WorkspaceHeaderAction[];
}
function useRecord({ id }: { id: string }): SecondaryData<StackData> {
  const records = useContext(Records);
  const { actions } = documentHeaderModel(useDocumentEditor(), useTranslation().t);

  return records[id]
    ? { status: 'ready', data: { record: records[id], actions } }
    : { status: 'unavailable' };
}

function EditorScreen() {
  return (
    <AppContent className="h-full w-full">
      <DocumentEditor />
    </AppContent>
  );
}

function EditorHeader({ data }: { data: StackData }) {
  return <WorkspaceHeaderIdentity headingLevel={2} title={data.record.path} />;
}

const stack = defineSecondaryStack<{ id: string }, StackData, { editor: Record<string, never> }>({
  id: 'owner-v4-story-documents',
  initial: 'editor',
  useData: useRecord,
  screens: {
    editor: {
      title: 'Dokument',
      header: EditorHeader,
      actions: ({ data }) => data.actions,
      actionLabels: { moreActions: 'Więcej akcji' },
      component: EditorScreen,
    },
  },
});
interface FixtureProps {
  loseAck?: boolean;
  concurrent?: boolean;
  /** Every operation takes this long (ms) before it succeeds. */
  slowMs?: number;
}
type StoryRecords = Record<string, DocumentContent>;
interface WorkspaceProps extends FixtureProps {
  records: StoryRecords;
  setRecords: Dispatch<SetStateAction<StoryRecords>>;
  active: string;
  setActive: Dispatch<SetStateAction<string>>;
}
function Workspace({
  loseAck = false,
  concurrent = false,
  slowMs = 0,
  records,
  setRecords,
  active,
  setActive,
}: WorkspaceProps) {
  const attempts = useRef(0);
  const [payloads, setPayloads] = useState<string[]>([]),
    [submittedRevision, setSubmittedRevision] = useState(''),
    [submittedTarget, setSubmittedTarget] = useState('');
  const [tree, setTree] = useState(initialTree),
    [calls, setCalls] = useState(0);
  const editor = useDocumentEditor();
  const { t } = useTranslation();
  const documentHeader = documentHeaderModel(editor, t);
  const controller = useRef<DocumentTreeController>(null);
  const [busy, setBusy] = useState(false);
  const navigation = useSecondaryNavigation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const add = (documents: NewDocumentEntry[], folders: string[] = []) => {
    setCalls((value) => value + 1);
    setPayloads((current) => [...current, JSON.stringify(documents)]);
    if (loseAck && attempts.current++ === 0) {
      return Promise.reject(new Error('Lost ACK'));
    }

    if (
      folders.some((folder) => folder.includes('bad')) ||
      documents.some(
        (doc) =>
          doc.path.includes('bad') ||
          tree.documents.some((existing) => existing.path.toLowerCase() === doc.path.toLowerCase()),
      )
    ) {
      return Promise.reject(
        new HttpClientError('Conflict', {
          kind: 'http',
          status: 409,
          data: { error: 'DOCUMENT_PATH_CONFLICT', code: 'DOCUMENT_PATH_CONFLICT' },
        }),
      );
    }

    const added = documentTreeFixture({
      folders,
      documents: documents.map((doc) => ({ id: doc.path, path: doc.path })),
    });
    setTree((current) => ({
      ...current,
      documents: [...current.documents, ...added.documents],
      folders: [...current.folders, ...added.folders.slice(1)],
    }));
    setRecords((current) => ({
      ...current,
      ...Object.fromEntries(
        documents.map((doc) => [
          doc.path,
          {
            ...specification,
            id: doc.path,
            title: doc.path,
            path: doc.path,
            content: 'content' in doc ? doc.content : '',
          },
        ]),
      ),
    }));

    return Promise.resolve();
  };

  const operate = (operation: DocumentOperation) => {
    setCalls((value) => value + 1);
    setSubmittedRevision(operation.expectedRevision);
    setSubmittedTarget(operation.targetFolder ?? 'none');
    // As the Engine: a folder operation is checked against the FOLDER revision, a document one
    // (in the concurrent fixture) against the document's.
    const stale =
      operation.kind === 'folder'
        ? operation.expectedRevision !==
          tree.folders.find((folder) => folder.path === operation.path)?.revision
        : concurrent &&
          operation.expectedRevision !==
            tree.documents.find((doc) => doc.id === operation.documentId)?.revision;
    if (stale) {
      return Promise.reject(
        new HttpClientError('Conflict', {
          kind: 'http',
          status: 409,
          data: { error: 'DOCUMENT_REVISION_CONFLICT', code: 'DOCUMENT_REVISION_CONFLICT' },
        }),
      );
    }

    if (slowMs > 0) {
      return new Promise<void>((resolve) => setTimeout(resolve, slowMs));
    }

    // As the Runtime on a file system that ignores letter case (Windows).
    const renamed = tree.documents.find((doc) => doc.id === operation.documentId);
    const current = renamed?.path.split('/').at(-1);
    if (
      operation.action === 'rename' &&
      current !== undefined &&
      operation.name !== current &&
      operation.name?.toLowerCase() === current.toLowerCase()
    ) {
      return Promise.reject(
        new HttpClientError('Bad Request', {
          kind: 'http',
          status: 400,
          data: {
            error: 'DOCUMENT_OPERATION_INVALID',
            code: 'DOCUMENT_OPERATION_INVALID',
            details: { cause: 'case-only-rename' },
          },
        }),
      );
    }

    if (operation.action === 'rename') {
      setTree((current) => ({
        ...current,
        documents: current.documents.map((doc) =>
          doc.id === operation.documentId
            ? {
                ...doc,
                path:
                  (doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/') + 1) : '') +
                  operation.name,
              }
            : doc,
        ),
      }));
    }

    return Promise.resolve();
  };

  const select = (id: string) => {
    setActive(id);
    if (!supportsSplit) {
      void navigation.open(stack, { id });
    }
  };

  return (
    <Records.Provider value={records}>
      <output aria-label="Folder wysłanej operacji" className="sr-only">
        {submittedTarget}
      </output>
      <AppWorkspace
        fit="available"
        scroll="content"
        split="secondary"
        labels={{ backToPrimary: 'Wróć do listy dokumentów' }}
      >
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title="Documents"
              subtitle="Logowanie SSO"
              actions={documentRootActions(controller, tree.capabilities, busy, t)}
              labels={{ moreActions: 'Więcej akcji' }}
            />
          }
        >
          <AppContent className="h-full w-full">
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <DocumentsExplorer
                tree={tree}
                controllerRef={controller}
                onBusyChange={setBusy}
                active={active}
                onSelect={select}
                onAdd={add}
                onOperate={operate}
                beforeAction={
                  concurrent
                    ? () => {
                        const snapshot = tree;
                        queueMicrotask(() =>
                          setTree((current) => ({
                            ...current,
                            documents: current.documents.map((doc) =>
                              doc.id === 'decisions' ? { ...doc, revision: '2' } : doc,
                            ),
                          })),
                        );

                        return Promise.resolve(snapshot);
                      }
                    : undefined
                }
              />
              <output aria-label="Wysłana rewizja" className="sr-only">
                {submittedRevision}
              </output>
              <output aria-label="Tożsamość prób" className="sr-only">
                {payloads.length >= 2 && payloads[0] === payloads[1] ? 'same' : 'initial'}
              </output>
              <output aria-label="Liczba operacji" className="sr-only">
                {calls}
              </output>
            </div>
          </AppContent>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary
          header={
            <WorkspaceHeader
              title={records[active]?.path ?? 'Dokument'}
              actions={documentHeader.actions}
              labels={{ moreActions: 'Więcej akcji' }}
            />
          }
        >
          <EditorScreen />
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </Records.Provider>
  );
}

export function Fixture(props: FixtureProps) {
  const [active, setActive] = useState('specification'),
    [records, setRecords] = useState<StoryRecords>({
      specification,
      decisions: {
        ...specification,
        id: 'decisions',
        path: 'notes/decisions.md',
        title: 'Decisions',
        content: '# Decyzje\n\nKorzystamy z OIDC.',
      },
    });
  const client = useMemo(() => new QueryClient(), []);
  const services = useMemo(() => {
    const base = createSpecFlowAppServices();

    return {
      ...base,
      demoDocumentsApi: {
        ...base.demoDocumentsApi,
        save: () => Promise.resolve(saveResultFixture('2')),
      },
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <AppWorkspaceProvider>
            <AppShell style={{ height: '100vh', width: '100%' }} navigation={<div>Projekt</div>}>
              <DocumentEditorProvider specId="story" document={records[active]}>
                <Workspace
                  {...props}
                  records={records}
                  setRecords={setRecords}
                  active={active}
                  setActive={setActive}
                />
              </DocumentEditorProvider>
            </AppShell>
          </AppWorkspaceProvider>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}
