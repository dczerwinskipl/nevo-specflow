import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useTaskDocumentOperations } from '../authoring/documents/useTaskDocumentOperations';
import { RefusalAlert } from '../authoring/RefusalAlert';
import type { GateAction } from './GateList';
import { goToHeading } from './InlineAction';
import { WorkflowNow } from './WorkflowNow';

/** The Task's lifecycle primary (Approve or Resume), when the projection allows one. */
export interface LifecyclePrimary {
  readonly label: string;
  readonly busy: boolean;
  readonly onPress: () => void;
}

export interface TaskNowProps {
  readonly specId: string;
  readonly taskId: string;
  readonly typeTitle: string;
  readonly resource: TaskResourceFacts;
  readonly projection: WorkflowActionProjection;
  readonly primary?: LifecyclePrimary;
  readonly onCancelTask?: () => void;
  readonly onRemoveTask?: () => void;
  readonly onOpenDocument: (documentId: string) => void;
}

/**
 * The Now block of a Task: its workflow position and actions, with Approve or Resume as the one
 * primary while the Task is a draft or on hold. A missing Task document of an exit gate is created
 * from the gate itself and opened in the Secondary editor; the finish draft is kept meanwhile.
 */
export function TaskNow({
  specId,
  taskId,
  typeTitle,
  resource,
  projection,
  primary,
  onCancelTask,
  onRemoveTask,
  onOpenDocument,
}: TaskNowProps) {
  const { t } = useTranslation();
  const documents = useTaskDocumentOperations(specId, taskId);

  const gateAction = (gate: GateStatus): GateAction | undefined => {
    if (gate.scope.kind !== 'task' || gate.scope.taskId !== taskId) {
      return undefined;
    }

    if (gate.documentId && gate.reason !== 'no-document') {
      const documentId = gate.documentId;

      return {
        label: t('workflowExecution.gate.openDocument'),
        onSelect: () => onOpenDocument(documentId),
      };
    }

    if (gate.reason !== 'no-document') {
      return undefined;
    }

    return {
      label: t('workflowExecution.gate.createDocument', { type: gate.documentType }),
      onSelect: () =>
        documents.create.mutate(
          { path: `${gate.documentType}.md`, type: gate.documentType },
          {
            onSuccess: (result) => {
              const created = result.documents[0];
              if (created) {
                onOpenDocument(created.id);
              }
            },
          },
        ),
    };
  };

  return (
    <div className="grid gap-3 pb-6">
      <WorkflowNow
        subject={{ specId, taskId }}
        projection={projection}
        headingId="task-workflow-heading"
        links={{
          context: () => goToHeading('task-context-heading'),
          dependencies: () => goToHeading('task-dependencies-heading'),
        }}
        primaryAction={
          primary ? (
            <Button onClick={primary.onPress} disabled={primary.busy}>
              {primary.label}
            </Button>
          ) : undefined
        }
        firstStart={{
          taskId,
          typeTitle,
          ...(onCancelTask ? { onCancelTask } : {}),
          ...(onRemoveTask ? { onRemoveTask } : {}),
        }}
        artifactOptions={resource.documents.map((document) => ({
          value: document.path,
          label: document.path,
        }))}
        gateAction={gateAction}
        gateDocument={(gate) =>
          gate.scope.kind === 'task' && gate.scope.taskId === taskId && gate.documentId
            ? resource.documents.find((document) => document.id === gate.documentId)?.path
            : undefined
        }
      />
      {documents.create.isError ? <RefusalAlert error={documents.create.error} /> : null}
    </div>
  );
}
