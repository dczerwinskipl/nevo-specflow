import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { translateNow } from '../../../i18n/message';
import {
  actionVariantClasses,
  cn,
  fastColorTransitionClassName,
  Alert,
  AppContent,
  AppWorkspaceBody,
  Button,
  MarkdownDocument,
  ScrollArea,
  defineSecondaryStack,
  useSecondaryStack,
  useSecondaryNavigation,
  type SecondaryData,
} from '@nevo/ui';
import type { DemoSessionDetail } from '@nevo/specflow-contracts/demo';
import { useAppServices } from '../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../specs/read-model';
import { documentKeys } from '../../documents/read-model';
import { sessionKeys } from '../queries';
import { useRememberSessionReturn } from '../SessionStateProvider';
interface Params {
  specId: string;
  sessionId: string;
}
interface Data extends Params {
  session: DemoSessionDetail;
}
interface Pages {
  context: Record<string, never>;
  documents: Record<string, never>;
  preview: { documentId: string };
  project: Record<string, never>;
  instructions: Record<string, never>;
}
function useData(params: Params): SecondaryData<Data> {
  const { sessionsApi } = useAppServices();
  const query = useQuery({
    queryKey: sessionKeys.detail(params.specId, params.sessionId),
    queryFn: ({ signal }) => sessionsApi.session(params.specId, params.sessionId, signal),
  });
  if (query.isPending) return { status: 'loading' };
  if (!query.data) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'ready', data: { ...params, session: query.data } };
}
function ContextLinks({
  data,
  onSelect,
}: {
  data: Data;
  onSelect: (page: 'documents' | 'project' | 'instructions') => void;
}) {
  const { t } = useTranslation();
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <div className="grid gap-2">
          <p className="mb-3 text-body-sm text-content-muted">{t('sessions.demo.contextIntro')}</p>
          {[
            {
              id: 'documents' as const,
              title: t('documents.title'),
              text: t('sessions.demo.documentsHint'),
            },
            {
              id: 'project' as const,
              title: t('sessions.demo.project'),
              text: data.session.context.project,
            },
            {
              id: 'instructions' as const,
              title: t('sessions.demo.instructions'),
              text: t('sessions.demo.instructionsHint'),
            },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              className={cn(
                actionVariantClasses.ghost,
                fastColorTransitionClassName,
                'w-full rounded-control p-4 text-left focus-visible:outline-2 focus-visible:outline-focus-ring',
              )}
              onClick={() => onSelect(item.id)}
            >
              <span>
                <strong className="block text-title-sm">{item.title}</strong>
                <span className="block text-body-sm text-content-muted">{item.text}</span>
              </span>
            </button>
          ))}
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}
function SessionContextView({ data }: { data: Data }) {
  const stack = useSecondaryStack<Pages>();
  return <ContextLinks data={data} onSelect={(page) => void stack.navTo(page, {})} />;
}
function Documents({ data }: { data: Data }) {
  const { t } = useTranslation();
  const workspace = useSpecificationWorkspace(data.specId);
  const stack = useSecondaryStack<Pages>();
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        {workspace.isPending ? (
          <p role="status">{t('sessions.demo.loadingDocuments')}</p>
        ) : !workspace.data ? (
          <Alert tone="attention" title={t('sessions.demo.documentsUnavailable')} />
        ) : (
          <div className="grid gap-2">
            {workspace.data.documents.map((doc) => (
              <button
                type="button"
                key={doc.id}
                className={cn(
                  actionVariantClasses.ghost,
                  fastColorTransitionClassName,
                  'w-full rounded-control p-4 text-left focus-visible:outline-2 focus-visible:outline-focus-ring',
                )}
                onClick={() => void stack.navTo('preview', { documentId: doc.id })}
              >
                <span>
                  <strong className="block text-title-sm">{doc.title}</strong>
                  <span className="block break-all text-body-sm text-content-muted">
                    {doc.filename}
                  </span>
                </span>
              </button>
            ))}
            {!workspace.data.documents.length && (
              <p className="text-body-sm text-content-muted">{t('sessions.demo.noDocuments')}</p>
            )}
          </div>
        )}
      </AppWorkspaceBody>
    </AppContent>
  );
}
function Preview({ data, params }: { data: Data; params: { documentId: string } }) {
  const { t } = useTranslation();
  const { documentApi } = useAppServices();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const rememberSessionReturn = useRememberSessionReturn();
  const query = useQuery({
    queryKey: documentKeys.detail(data.specId, params.documentId),
    queryFn: ({ signal }) => documentApi.getDocument(data.specId, params.documentId, signal),
  });
  return (
    <AppContent className="h-full w-full">
      <div className="flex h-full min-h-0 flex-col">
        {!query.data ? (
          <p role="status" className="p-5">
            {query.isPending
              ? t('sessions.demo.loadingDocument')
              : t('sessions.demo.documentUnavailable')}
          </p>
        ) : (
          <>
            <div className="shrink-0 border-b border-border-subtle p-4">
              <strong className="block text-title-sm">{query.data.title}</strong>
              <p className="break-all text-body-sm text-content-muted">
                {t('sessions.demo.previewLine', { filename: query.data.path })}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => {
                  rememberSessionReturn(data.specId, data.sessionId);
                  void navigate({
                    to: '/specs/$specId/documents/$documentId',
                    params: { specId: data.specId, documentId: params.documentId },
                    search: { collection },
                  });
                }}
              >
                {t('sessions.demo.openInDocuments')}
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1" contentClassName="p-5">
              {query.data.content === undefined ? (
                // An image or a file without text to render: it opens in Documents (above).
                <p className="text-body-sm text-content-secondary">
                  {t('sessions.demo.cannotShow')}
                </p>
              ) : query.data.path.toLowerCase().endsWith('.txt') ? (
                <pre className="whitespace-pre-wrap break-words text-body-sm">
                  {query.data.content}
                </pre>
              ) : (
                <MarkdownDocument source={query.data.content ?? ''} />
              )}
            </ScrollArea>
          </>
        )}
      </div>
    </AppContent>
  );
}
function Project({ data }: { data: Data }) {
  const { t } = useTranslation();
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <h2 className="text-title-sm">{data.session.context.project}</h2>
        <p className="mt-3 text-body-sm text-content-muted">{data.session.context.specification}</p>
        <p className="mt-3 break-all text-body-sm text-content-muted">
          {data.session.location.path} · {data.session.location.branch}
        </p>
        <p className="mt-3 text-body-sm text-content-muted">{t('sessions.demo.demoContext')}</p>
      </AppWorkspaceBody>
    </AppContent>
  );
}
function Instructions() {
  const { t } = useTranslation();
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <h2 className="text-title-sm">{t('sessions.demo.writer')}</h2>
        <p className="mt-3 text-body-sm text-content-muted">
          {t('sessions.demo.instructionsBody')}
        </p>
      </AppWorkspaceBody>
    </AppContent>
  );
}
export const sessionContextStack = defineSecondaryStack<Params, Data, Pages>({
  id: 'demo-session-context',
  initial: 'context',
  useData,
  screens: {
    // `title` is a plain string of the design-system contract, read at render time.
    context: {
      get title() {
        return translateNow('sessions.demo.context');
      },
      component: SessionContextView,
    },
    documents: {
      get title() {
        return translateNow('documents.title');
      },
      component: Documents,
    },
    preview: {
      get title() {
        return translateNow('sessions.demo.previewTitle');
      },
      component: Preview,
    },
    project: {
      get title() {
        return translateNow('sessions.demo.project');
      },
      component: Project,
    },
    instructions: {
      get title() {
        return translateNow('sessions.demo.instructions');
      },
      component: Instructions,
    },
  },
});

// Declarative desktop hub uses the same screens; closing an inspector restores this hub.
const documentContextStack = defineSecondaryStack<Params, Data, Pages>({
  ...sessionContextStack,
  id: 'demo-session-documents',
  initial: 'documents',
});
const projectContextStack = defineSecondaryStack<Params, Data, Pages>({
  ...sessionContextStack,
  id: 'demo-session-project',
  initial: 'project',
});
const instructionContextStack = defineSecondaryStack<Params, Data, Pages>({
  ...sessionContextStack,
  id: 'demo-session-instructions',
  initial: 'instructions',
});
export function SessionContextPanel(params: Params) {
  const { t } = useTranslation();
  const state = useData(params);
  const navigation = useSecondaryNavigation();
  if (state.status !== 'ready')
    return (
      <p className="p-4 text-body-sm text-content-muted">
        {state.status === 'loading'
          ? t('sessions.demo.loadingContext')
          : t('sessions.demo.contextUnavailable')}
      </p>
    );
  return (
    <ContextLinks
      data={state.data}
      onSelect={(page) =>
        void navigation.open(
          page === 'documents'
            ? documentContextStack
            : page === 'project'
              ? projectContextStack
              : instructionContextStack,
          params,
        )
      }
    />
  );
}
