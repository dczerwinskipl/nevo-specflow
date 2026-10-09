import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { ActivityEvent, SpecificationWorkspaceData, TaskItem } from './model';

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
      group: group.id,
    })),
  }));
  const sessionSummaries = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    taskCount: session.taskIds.length > 0 ? String(session.taskIds.length) : undefined,
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
    title: specification.title,
    intro: specification.summary,
    isEmpty: specification.preparationState === 'empty',
    isPreparing: specification.preparationState === 'preparing',
    hasGit: sections.repository.state === 'available',
    hasExtensions: false,
    sectionAvailability: {
      attention: sections.attention.state,
      tasks: sections.tasks.state,
      documents: sections.documents.state,
      sessions: sections.sessions.state,
      activity: sections.activity.state,
      repository: sections.repository.state,
      changes: sections.changes.state,
    },
    attentionItems:
      sections.attention.state === 'available'
        ? sections.attention.data.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            reason: item.reason,
            actionLabel: '',
            actionCode: item.kind,
            targetId: item.targetId,
          }))
        : [],
    taskGroups,
    completedTasksCount: tasks?.completed,
    totalTasksCount: tasks?.total,
    documents:
      sections.documents.state === 'available'
        ? sections.documents.data.items.map((doc) => ({
            id: doc.id,
            title: doc.title,
            kind: doc.kind,
            summary: doc.summary,
          }))
        : [],
    mainDocumentId:
      sections.documents.state === 'available' ? sections.documents.data.items[0]?.id : undefined,
    sessions: sessionSummaries,
    resumeSession: sessionSummaries.find((session) => session.id === dto.recommendedSessionId),
    activityEvents:
      sections.activity.state === 'available'
        ? sections.activity.data.items.flatMap((event): ActivityEvent[] => {
            const core = {
              id: event.id,
              time: event.occurredAt,
              title: event.title,
              description: event.description,
            };
            if (event.kind === 'info') {
              return [
                { ...core, kind: 'info', ...(event.targetId ? { targetId: event.targetId } : {}) },
              ];
            }
            if (!event.targetId) return [];
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
