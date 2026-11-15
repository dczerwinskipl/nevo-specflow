import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  InlineNote,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  TextInput,
  Typography,
} from '@nevo/ui';
import { TASK_ID_PATTERN } from '@nevo/specflow-contracts/documents';
import type { TaskTypeOption } from '@nevo/specflow-contracts/workflow';
import { RefusalAlert } from './RefusalAlert';
import { useCreateTask } from './useTaskAuthoring';

const TASK_ID = new RegExp(TASK_ID_PATTERN);

export interface NewTaskDialogProps {
  readonly specId: string;
  readonly specTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The task types the projection allows (`specification.taskTypes`). */
  readonly taskTypes: readonly TaskTypeOption[];
  /** The Tasks of the Specification a new Task may depend on, in list order. */
  readonly tasks: readonly { readonly id: string; readonly title: string }[];
  readonly onCreated?: (taskId: string) => void;
}

/** New task: a draft of an allowed Task Type (immutable once created), with its dependencies. */
export function NewTaskDialog(props: NewTaskDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {/* Mounted only while open: every opening starts from an empty form. */}
        {props.open ? <NewTaskForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewTaskForm({
  specId,
  specTitle,
  onOpenChange,
  taskTypes,
  tasks,
  onCreated,
}: NewTaskDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateTask(specId);
  const [type, setType] = useState(taskTypes.length === 1 ? taskTypes[0]!.id : '');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [dependsOn, setDependsOn] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const idInvalid = !TASK_ID.test(taskId);
  const titleInvalid = title.trim() === '';
  const typeInvalid = type === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (idInvalid || titleInvalid || typeInvalid || create.isPending) {
      return;
    }

    create.mutate(
      {
        taskId,
        title: title.trim(),
        type,
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(dependsOn.length > 0 ? { dependsOn: [...dependsOn] } : {}),
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          onCreated?.(result.taskId);
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('taskAuthoring.newTask.title')}</DialogTitle>
        <DialogDescription>
          {t('taskAuthoring.newTask.description', { spec: specTitle })}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {create.isError ? <RefusalAlert error={create.error} /> : null}
          {taskTypes.length === 0 ? (
            <InlineNote tone="attention">{t('taskAuthoring.newTask.noTypes')}</InlineNote>
          ) : (
            <div className="grid gap-2">
              <Typography as="p" variant="label-sm" id={`${formId}-type`}>
                {t('taskAuthoring.newTask.typeLegend')}
              </Typography>
              <RadioGroup value={type} onValueChange={setType} aria-labelledby={`${formId}-type`}>
                {taskTypes.map((option) => (
                  <RadioGroupOption
                    key={option.id}
                    value={option.id}
                    label={option.title}
                    description={t('taskAuthoring.newTask.typeDescription', {
                      description: option.description,
                      workflow: option.workflow.title,
                      steps: option.workflow.steps.map((step) => step.title).join(' → '),
                    })}
                  />
                ))}
              </RadioGroup>
              {submitted && typeInvalid ? (
                <InlineNote tone="danger">{t('taskAuthoring.newTask.typeRequired')}</InlineNote>
              ) : null}
            </div>
          )}
          <Field invalid={submitted && idInvalid}>
            <Field.Label>{t('taskAuthoring.newTask.idLabel')}</Field.Label>
            <TextInput
              className="font-mono"
              value={taskId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTaskId(event.target.value)}
            />
            {submitted && idInvalid ? (
              <Field.Error>{t('taskAuthoring.newTask.idInvalid')}</Field.Error>
            ) : (
              <Field.Description>{t('taskAuthoring.newTask.idDescription')}</Field.Description>
            )}
          </Field>
          <Field invalid={submitted && titleInvalid}>
            <Field.Label>{t('taskAuthoring.newTask.titleLabel')}</Field.Label>
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
            {submitted && titleInvalid ? (
              <Field.Error>{t('taskAuthoring.newTask.titleRequired')}</Field.Error>
            ) : null}
          </Field>
          <Field>
            <Field.Label>{t('taskAuthoring.newTask.summaryLabel')}</Field.Label>
            <TextArea
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <Field.Description>{t('taskAuthoring.newTask.summaryDescription')}</Field.Description>
          </Field>
          {tasks.length > 0 ? (
            <fieldset className="grid gap-3">
              <legend className="mb-3 text-label-sm text-content-primary">
                {t('taskAuthoring.newTask.dependsOnLegend')}
              </legend>
              {tasks.map((task) => (
                <CheckboxField
                  key={task.id}
                  label={`${task.id} · ${task.title}`}
                  checked={dependsOn.includes(task.id)}
                  onCheckedChange={(checked) =>
                    setDependsOn((current) =>
                      checked === true
                        ? [...current, task.id]
                        : current.filter((id) => id !== task.id),
                    )
                  }
                />
              ))}
            </fieldset>
          ) : null}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={taskTypes.length === 0 || create.isPending}>
          {t('taskAuthoring.newTask.create')}
        </Button>
      </DialogFooter>
    </>
  );
}
