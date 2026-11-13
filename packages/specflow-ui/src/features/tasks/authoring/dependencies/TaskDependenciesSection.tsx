import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  InformationList,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Typography,
} from '@nevo/ui';
import type { TaskAuthoring } from '@nevo/specflow-contracts/workflow';
import { OperationalRow } from '../../../../shared/operational-list';
import type { SemanticSupporting } from '../../../../shared/operational-list/OperationalRow.types';
import { SectionAddButton, SectionCallToAction } from '../SectionAddButton';
import { SectionEditError } from '../SectionEditError';
import { SupportSection } from '../SupportSection';
import { useTaskCommands } from '../useTaskAuthoring';
import { AddDependencyDialog } from './AddDependencyDialog';
import { namedCandidates, type DependencyTask } from './dependencyModel';

/** A dependency's state as a status: words with an icon, never colour alone. */
function dependencyStatus(task: DependencyTask): SemanticSupporting {
  switch (task.statusId) {
    case 'completed':
      return { text: task.statusLabel, tone: 'success', icon: 'circle-check' };
    case 'in-progress':
      return { text: task.statusLabel, tone: 'info', icon: 'workflow' };
    case 'draft':
    case 'blocked':
    case 'on-hold':
    case 'broken':
      return { text: task.statusLabel, tone: 'attention', icon: 'triangle-alert' };
    default:
      return { text: task.statusLabel, icon: 'clock' };
  }
}

export interface TaskDependenciesSectionProps {
  readonly specId: string;
  readonly taskId: string;
  readonly revision: string;
  readonly dependsOn: readonly string[];
  /** The other Tasks of the Specification (workspace rows). */
  readonly tasks: readonly DependencyTask[];
  /** The Engine's candidates (`taskAuthoring.dependencyCandidates`). */
  readonly candidates: TaskAuthoring['dependencyCandidates'];
  /** The projection allows editing the dependencies (only before the first start). */
  readonly editable: boolean;
  /** The Task has started: its dependencies are fixed. */
  readonly started: boolean;
  readonly collapsible: boolean;
  readonly onOpenTask: (taskId: string) => void;
  readonly onLoadLatest: () => void;
}

/** Depends on: the dependencies with their state; edited by checklist before the first start. */
export function TaskDependenciesSection({
  specId,
  taskId,
  revision,
  dependsOn,
  tasks,
  candidates,
  editable,
  started,
  collapsible,
  onOpenTask,
  onLoadLatest,
}: TaskDependenciesSectionProps) {
  const { t } = useTranslation();
  const { edit } = useTaskCommands(specId, taskId);
  const [adding, setAdding] = useState(false);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const save = (next: readonly string[], onSuccess?: () => void) =>
    edit.mutate({ expectedRevision: revision, dependsOn: [...next] }, { onSuccess });
  const openPicker = () => {
    edit.reset();
    setAdding(true);
  };

  if (dependsOn.length === 0 && !editable) {
    return null;
  }

  return (
    <SupportSection
      id="task-dependencies-heading"
      title={t('taskAuthoring.section.dependsOn')}
      icon="network"
      count={dependsOn.length > 0 ? dependsOn.length : undefined}
      collapsible={collapsible}
      actions={
        editable && dependsOn.length > 0 ? (
          <SectionAddButton label={t('taskAuthoring.dependencies.add')} onPress={openPicker} />
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {edit.isError && !adding ? (
          <SectionEditError taskId={taskId} error={edit.error} onLoadLatest={onLoadLatest} />
        ) : null}
        {dependsOn.length === 0 ? (
          <>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('taskAuthoring.dependencies.none')}
            </Typography>
            <SectionCallToAction label={t('taskAuthoring.dependencies.add')} onPress={openPicker} />
          </>
        ) : null}
        {started ? <InlineNote>{t('taskAuthoring.dependencies.fixed')}</InlineNote> : null}
        {dependsOn.length > 0 ? (
          <InformationList>
            {dependsOn.map((id) => {
              const other = byId.get(id);

              return (
                <OperationalRow
                  key={id}
                  titleAs="h3"
                  primary={other?.title ?? id}
                  onPrimaryClick={other ? () => onOpenTask(id) : undefined}
                  factsLayout="inline"
                  compactFacts={
                    other?.typeTitle
                      ? [{ text: id, mono: true }, other.typeTitle]
                      : [{ text: id, mono: true }]
                  }
                  supporting={
                    other
                      ? dependencyStatus(other)
                      : {
                          text: t('taskAuthoring.dependencies.missingTask', { id }),
                          tone: 'attention',
                          icon: 'triangle-alert',
                        }
                  }
                  trailing={
                    editable ? (
                      <Menu modal={false}>
                        <MenuTrigger asChild>
                          <IconButton
                            icon="ellipsis"
                            size="sm"
                            aria-label={t('taskAuthoring.dependencies.actionsFor', { id })}
                          />
                        </MenuTrigger>
                        <MenuContent align="end">
                          <MenuItem
                            tone="danger"
                            onSelect={() => save(dependsOn.filter((other) => other !== id))}
                          >
                            {t('taskAuthoring.dependencies.remove')}
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    ) : undefined
                  }
                />
              );
            })}
          </InformationList>
        ) : null}
      </div>
      <AddDependencyDialog
        taskId={taskId}
        open={adding}
        onOpenChange={setAdding}
        candidates={namedCandidates(candidates, tasks)}
        pending={edit.isPending}
        error={
          edit.isError ? (
            <SectionEditError taskId={taskId} error={edit.error} onLoadLatest={onLoadLatest} />
          ) : undefined
        }
        onAdd={(ids) => save([...dependsOn, ...ids], () => setAdding(false))}
      />
    </SupportSection>
  );
}
