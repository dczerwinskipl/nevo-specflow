import { translateNow } from '../../../i18n/message';
import { createContext, useContext } from 'react';
import {
  AppContent,
  AppWorkspaceBody,
  defineSecondaryStack,
  useSecondaryStack,
  WorkspaceHeaderIdentity,
  type SecondaryData,
  type SecondaryScreenProps,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { appI18n } from '../../../i18n';
import type { ActivityEvent, SpecificationWorkspaceData } from '../read-model/model';

import { SpecificationActivityHistory } from './activity/SpecificationActivityHistory';
import { DocumentContent } from '../../documents';
import { DocumentReadingColumns } from '../../../shared/document-reading/DocumentReadingColumns';
import { feedbackStack } from '../../tasks';
import { productIcons } from '../../../shared/product-icons';

export interface SpecificationSecondaryContextValue {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly openFullTask: (taskId: string) => void;
  readonly openFullDocument?: (documentId: string) => void;
  readonly openSession?: (sessionId: string) => void;
  readonly openDoc?: (docId: string) => void;
  /** Re-reads the Workspace snapshot (e.g. after an unavailable section). */
  readonly retry?: () => void;
}

export const SpecificationSecondaryDataContext =
  createContext<SpecificationSecondaryContextValue | null>(null);

export interface DocumentPreviewData {
  readonly fullDocumentLabel?: string;
  readonly specId: string;
  readonly documentId: string;
  readonly title: string;
  readonly openFullDocument?: (documentId: string) => void;
}
export interface DocumentPreviewPages {
  preview: Record<never, never>;
}
function useDocumentPreviewData({
  specId,
  documentId,
}: {
  specId: string;
  documentId: string;
}): SecondaryData<DocumentPreviewData> {
  const { t } = useTranslation();
  const context = useContext(SpecificationSecondaryDataContext);
  if (context?.specId !== specId) {
    return {
      status: 'unavailable',
      message: t('unreadable.failed.description'),
    };
  }

  const document = context.data.documents.find((item) => item.id === documentId);
  const title = document?.filename ?? document?.title ?? t('specification.documentPreviewTitle');

  return {
    status: 'ready',
    data: {
      specId,
      documentId,
      title,
      fullDocumentLabel: t('specification.openFullDocument'),
      openFullDocument: context.openFullDocument,
    },
  };
}

function DocumentPreviewHeader({
  data,
}: SecondaryScreenProps<DocumentPreviewData, DocumentPreviewPages['preview']>) {
  return <WorkspaceHeaderIdentity headingLevel={2} title={data.title} />;
}

function DocumentPreviewScreen({
  data,
}: SecondaryScreenProps<DocumentPreviewData, DocumentPreviewPages['preview']>) {
  return (
    <AppContent className="w-full">
      <AppWorkspaceBody scroll="area">
        <DocumentReadingColumns
          text={<DocumentContent specId={data.specId} documentId={data.documentId} />}
        />
      </AppWorkspaceBody>
    </AppContent>
  );
}

export const documentPreviewStack = defineSecondaryStack<
  { specId: string; documentId: string },
  DocumentPreviewData,
  DocumentPreviewPages
>({
  id: 'specification-document-preview',
  initial: 'preview',
  useData: useDocumentPreviewData,
  screens: {
    preview: {
      get title() {
        return translateNow('specification.documentPreviewTitle');
      },
      header: DocumentPreviewHeader,
      actions: ({ data }): readonly WorkspaceHeaderAction[] =>
        data.openFullDocument
          ? [
              {
                id: 'open-full-document',
                label: data.fullDocumentLabel ?? appI18n.t('specification.openFullDocument'),
                icon: 'open-full',
                primary: true,
                onPress: () => data.openFullDocument?.(data.documentId),
              },
            ]
          : [],
      component: DocumentPreviewScreen,
    },
  },
});

export interface HistorySecondaryData {
  readonly specId: string;
  readonly events: readonly ActivityEvent[];
  readonly availability: 'available' | 'unavailable' | 'forbidden';
  readonly retry?: () => void;
  readonly openTask: (taskId: string) => void;
  readonly openSession?: (sessionId: string) => void;
  readonly openDoc?: (docId: string) => void;
}

export function useHistoryData({
  specId,
}: {
  specId: string;
}): SecondaryData<HistorySecondaryData> {
  const context = useContext(SpecificationSecondaryDataContext);
  if (!context) {
    return { status: 'loading' };
  }

  return {
    status: 'ready',
    data: {
      specId,
      events: context.data.activityEvents,
      availability: context.data.sectionAvailability?.activity ?? 'available',
      retry: context.retry,
      openTask: context.openFullTask,
      openSession: context.openSession,
      openDoc: context.openDoc,
    },
  };
}

export interface HistoryPages {
  history: Record<never, never>;
}

export function ActivityHistoryHeader() {
  const { t } = useTranslation();

  return (
    <WorkspaceHeaderIdentity
      headingLevel={2}
      icon={productIcons.history}
      title={t('specification.activityHistory')}
      subtitle={t('specification.thisSpecification')}
    />
  );
}

export function ActivityHistoryScreen({
  data,
}: SecondaryScreenProps<HistorySecondaryData, HistoryPages['history']>) {
  const stack = useSecondaryStack<HistoryPages>();

  return (
    <AppContent className="w-content-standard max-w-full">
      <AppWorkspaceBody padding="none" scroll="area">
        <SpecificationActivityHistory
          specId={data.specId}
          // A feedback opened from the history is pushed: Back returns to the history.
          onOpenFeedback={(ref) => void stack.navTo(feedbackStack, { specId: data.specId, ref })}
          events={data.events}
          availability={data.availability}
          onRetry={data.retry}
          onOpenTask={(taskId) => {
            data.openTask(taskId);
          }}
          onOpenSession={data.openSession}
          {...(data.openDoc ? { onOpenDoc: data.openDoc } : {})}
        />
      </AppWorkspaceBody>
    </AppContent>
  );
}

export const historyStack = defineSecondaryStack<
  { specId: string },
  HistorySecondaryData,
  HistoryPages
>({
  id: 'specification-history',
  initial: 'history',
  useData: useHistoryData,
  screens: {
    history: {
      get title() {
        return translateNow('specification.activityHistory');
      },
      header: ActivityHistoryHeader,
      component: ActivityHistoryScreen,
    },
  },
});
