import type {
  SpecificationWorkspaceResponse,
  WorkspaceAttention,
} from '@nevo/specflow-contracts/specs/workspace';
import type {
  ActivityEvent,
  AttentionItem,
  FeatureAttentionSource,
  SpecificationWorkspaceData,
  TaskItem,
} from './model';
import { translateNow } from '../../../i18n/message';

function mapAttention(items: readonly WorkspaceAttention[]): AttentionItem[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    reason: item.reason,
    actionLabel: '',
    actionCode: item.kind,
    targetId: item.targetId,
    priority: item.priority,
  }));
}

function mapFeatureAttention(
  section: SpecificationWorkspaceResponse['sections']['tasks' | 'sessions' | 'repository'],
): FeatureAttentionSource {
  return section.state === 'available'
    ? { state: 'available', items: mapAttention(section.data.attention) }
    : section.state === 'unavailable'
      ? { state: 'unavailable', reason: section.reason }
      : { state: 'forbidden' };
}

export function mapWorkspaceResponse(
  dto: SpecificationWorkspaceResponse,
): SpecificationWorkspaceData {
  const { sections, specification } = dto;
  const tasks = sections.tasks.state === 'available' ? sections.tasks.data : undefined;
  const sessions = sections.sessions.state === 'available' ? sections.sessions.data.items : [];
  const taskGroups = (tasks?.groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    tasks: group.tasks.map((task): TaskItem => ({
      id: task.id,
      title: task.title,
      status: task.status.lifecycle,
      statusCode: task.status.lifecycle,
      lifecycle: task.status.lifecycle,
      statusId: task.status.id,
      ...(task.type ? { typeTitle: task.type.title } : {}),
      ...(task.dependsOn ? { dependsOn: task.dependsOn } : {}),
      group: group.id,
    })),
  }));
  const sessionSummaries = sessions.map((session) => ({
    id: session.id,
    // The server never invents a title; an untitled Session shows the UI's untitled label.
    title: session.title ?? translateNow('sessions.untitled'),
    navigationStatus: session.status,
    taskCount: session.taskIds.length,
    updatedAt: session.updatedAt,
    providerId: session.providerId,
    ...(session.providerTitle ? { providerTitle: session.providerTitle } : {}),
    ...(session.modelId ? { modelId: session.modelId } : {}),
    ...(session.modelTitle ? { modelTitle: session.modelTitle } : {}),
    activityCode:
      session.status === 'active' || session.status === 'attention' ? session.status : undefined,
    activity:
      session.status === 'active'
        ? { label: '', tone: 'info' as const, icon: 'loader' as const, animate: true }
        : session.status === 'attention'
          ? {
              label: '',
              tone: 'attention' as const,
              icon: 'triangle-alert' as const,
            }
          : undefined,
  }));
  const repository =
    sections.repository.state === 'available' ? sections.repository.data : undefined;
  const changes = sections.changes.state === 'available' ? sections.changes.data : undefined;

  return {
    id: specification.id,
    ...(specification.key ? { key: specification.key } : {}),
    title: specification.title,
    intro: specification.summary,
    isEmpty: specification.preparationState === 'empty',
    isPreparing: specification.preparationState === 'preparing',
    // A temporarily unavailable repository is unknown, not absent.
    // Forbidden or not-yet-implemented Git is not a usable navigation target.
    hasGit:
      sections.repository.state === 'available'
        ? true
        : sections.repository.state === 'forbidden' ||
            sections.repository.reason === 'not_implemented'
          ? false
          : undefined,
    sectionAvailability: {
      tasks: sections.tasks.state,
      documents: sections.documents.state,
      sessions: sections.sessions.state,
      activity: sections.activity.state,
      repository: sections.repository.state,
      changes: sections.changes.state,
    },
    sectionUnavailableReason: Object.fromEntries(
      Object.entries(sections).flatMap(([id, section]) =>
        section.state === 'unavailable' ? [[id, section.reason]] : [],
      ),
    ),
    attentionItems: mapAttention(specification.attention),
    featureAttention: {
      tasks: mapFeatureAttention(sections.tasks),
      sessions: mapFeatureAttention(sections.sessions),
      git: mapFeatureAttention(sections.repository),
    },
    taskGroups,
    completedTasksCount: tasks?.completed,
    totalTasksCount: tasks?.total,
    documents:
      sections.documents.state === 'available'
        ? sections.documents.data.items.map((doc) => ({
            id: doc.id,
            title: doc.title,
            kind: doc.kind,
            ...(doc.filename ? { filename: doc.filename } : {}),
            summary: doc.summary,
          }))
        : [],
    documentFolders:
      sections.documents.state === 'available' ? sections.documents.data.folders : undefined,
    // The expand target is the overview the description comes from, never a substitute document.
    overviewDocumentId:
      sections.documents.state === 'available'
        ? sections.documents.data.overviewDocumentId
        : undefined,
    sessions: sessionSummaries,
    ...(sections.sessions.state === 'available' && sections.sessions.data.hasMore
      ? { sessionsHasMore: true }
      : {}),
    startSession: {
      available: dto.actions.startSession.available,
      ...(dto.actions.startSession.reason ? { reason: dto.actions.startSession.reason } : {}),
      ...(dto.actions.startSession.path ? { path: dto.actions.startSession.path } : {}),
    },
    resumeSession: sessionSummaries.find((session) => session.id === dto.recommendedSessionId),
    activityEvents:
      sections.activity.state === 'available'
        ? sections.activity.data.items.flatMap((event): ActivityEvent[] => {
            const core = {
              id: event.id,
              time: event.occurredAt,
              ...(event.event ? { event: event.event } : {}),
              title: event.title,
              description: event.description,
            };
            if (event.kind === 'info') {
              return [
                { ...core, kind: 'info', ...(event.targetId ? { targetId: event.targetId } : {}) },
              ];
            }

            if (!event.targetId) {
              return [];
            }

            return [{ ...core, kind: event.kind, targetId: event.targetId }];
          })
        : [],
    repoContext: repository,
    changes,
    executionReadiness: {
      canExecute: dto.actions.executeTasks.available,
      reasonCode: dto.actions.executeTasks.reason,
      blockers: [],
    },
  };
}
