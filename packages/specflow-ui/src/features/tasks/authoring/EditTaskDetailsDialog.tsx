import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DescriptionList,
  Field,
  InlineNote,
  TextArea,
  TextInput,
} from '@nevo/ui';
import { RefusalAlert } from './RefusalAlert';
import { isRevisionConflict } from './refusal';
import { useTaskCommands } from './useTaskAuthoring';

/** The editable details of a Task at one manifest revision. */
export interface TaskDetailsVersion {
  readonly revision: string;
  readonly title: string;
  readonly summary: string;
}

export interface EditTaskDetailsDialogProps {
  readonly specId: string;
  readonly taskId: string;
  readonly typeTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The details as last read. */
  readonly current: TaskDetailsVersion;
  /** Reads the Task again; resolves with the latest details. */
  readonly reload: () => Promise<TaskDetailsVersion | undefined>;
}

/**
 * Edit details: Title and Summary; the Task Type is read-only. A newer Task revision refuses the
 * save; the edits are kept and the person copies them or loads the latest version (the Documents
 * conflict pattern).
 */
export function EditTaskDetailsDialog(props: EditTaskDetailsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {props.open ? <EditForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  specId,
  taskId,
  typeTitle,
  onOpenChange,
  current,
  reload,
}: EditTaskDetailsDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { edit } = useTaskCommands(specId, taskId);
  // The version the edits are based on: the save names its revision.
  const [base, setBase] = useState(current);
  const [title, setTitle] = useState(current.title);
  const [summary, setSummary] = useState(current.summary);
  const [copied, setCopied] = useState(false);
  const conflict = edit.isError && isRevisionConflict(edit.error);
  const titleInvalid = title.trim() === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (titleInvalid || conflict || edit.isPending) {
      return;
    }

    edit.mutate(
      {
        expectedRevision: base.revision,
        title: title.trim(),
        summary: summary.trim() ? summary.trim() : null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const copyMine = () => {
    void navigator.clipboard
      ?.writeText(summary.trim() ? `${title}\n\n${summary}` : title)
      .then(() => setCopied(true));
  };

  const loadLatest = async () => {
    const latest = await reload();
    if (latest) {
      setBase(latest);
      setTitle(latest.title);
      setSummary(latest.summary);
      setCopied(false);
      edit.reset();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('taskAuthoring.edit.title', { id: taskId })}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {conflict ? (
            <Alert
              role="alert"
              tone="danger"
              title={t('taskAuthoring.edit.conflictTitle', { id: taskId })}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={copyMine}>
                    {t('taskAuthoring.edit.copyMine')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void loadLatest()}>
                    {t('taskAuthoring.edit.loadLatest')}
                  </Button>
                </div>
              }
            >
              {t('taskAuthoring.edit.conflictBody')}
            </Alert>
          ) : edit.isError ? (
            <RefusalAlert error={edit.error} />
          ) : null}
          {copied ? <InlineNote role="status">{t('taskAuthoring.edit.copied')}</InlineNote> : null}
          <Field invalid={titleInvalid}>
            <Field.Label>{t('taskAuthoring.newTask.titleLabel')}</Field.Label>
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
            {titleInvalid ? (
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
          <div className="grid gap-1">
            <DescriptionList layout="inline">
              <DescriptionList.Item>
                <DescriptionList.Term>{t('taskAuthoring.edit.typeLabel')}</DescriptionList.Term>
                <DescriptionList.Detail>{typeTitle}</DescriptionList.Detail>
              </DescriptionList.Item>
            </DescriptionList>
            <InlineNote>{t('taskAuthoring.edit.typeHint')}</InlineNote>
          </div>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={conflict || titleInvalid || edit.isPending}>
          {t('taskAuthoring.edit.save')}
        </Button>
      </DialogFooter>
    </>
  );
}
