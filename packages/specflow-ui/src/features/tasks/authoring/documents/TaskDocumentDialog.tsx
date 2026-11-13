import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@nevo/ui';
import { RefusalAlert } from '../RefusalAlert';
import { useDocumentTypes, useTaskDocumentOperations } from './useTaskDocumentOperations';

export type TaskDocumentDialogRequest =
  | { readonly mode: 'new' }
  | {
      readonly mode: 'rename' | 'delete';
      readonly id: string;
      readonly path: string;
      readonly revision: string;
    };

/** New, Rename and Delete of a Task document (`task.md` is never offered: it is protected). */
export function TaskDocumentDialog({
  specId,
  taskId,
  request,
  onClose,
}: {
  readonly specId: string;
  readonly taskId: string;
  /** Undefined: closed. */
  readonly request: TaskDocumentDialogRequest | undefined;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={request !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        {request ? (
          <DocumentForm specId={specId} taskId={taskId} request={request} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DocumentForm({
  specId,
  taskId,
  request,
  onClose,
}: {
  specId: string;
  taskId: string;
  request: TaskDocumentDialogRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const operations = useTaskDocumentOperations(specId, taskId);
  const types = useDocumentTypes(request.mode === 'new');
  const name = request.mode === 'new' ? '' : (request.path.split('/').at(-1) ?? request.path);
  const [value, setValue] = useState(name);
  const [type, setType] = useState('');
  const mutation =
    request.mode === 'new'
      ? operations.create
      : request.mode === 'rename'
        ? operations.rename
        : operations.remove;
  const invalid = request.mode !== 'delete' && value.trim() === '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (invalid || mutation.isPending || (request.mode === 'new' && type === '')) {
      return;
    }

    const options = { onSuccess: onClose };
    if (request.mode === 'new') {
      operations.create.mutate({ path: value.trim(), type }, options);
    } else if (request.mode === 'rename') {
      operations.rename.mutate(
        { documentId: request.id, revision: request.revision, name: value.trim() },
        options,
      );
    } else {
      operations.remove.mutate({ documentId: request.id, revision: request.revision }, options);
    }
  };

  const copy =
    request.mode === 'new'
      ? {
          title: t('taskAuthoring.documents.newTitle'),
          confirm: t('taskAuthoring.documents.create'),
        }
      : request.mode === 'rename'
        ? {
            title: t('taskAuthoring.documents.renameTitle', { name }),
            confirm: t('taskAuthoring.documents.renameConfirm'),
          }
        : {
            title: t('taskAuthoring.documents.deleteTitle', { name }),
            confirm: t('taskAuthoring.documents.delete'),
          };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        {request.mode === 'delete' ? (
          <DialogDescription>{t('taskAuthoring.documents.deleteDescription')}</DialogDescription>
        ) : null}
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {mutation.isError ? <RefusalAlert error={mutation.error} /> : null}
          {request.mode !== 'delete' ? (
            <Field>
              <Field.Label>
                {request.mode === 'new'
                  ? t('taskAuthoring.documents.pathLabel')
                  : t('taskAuthoring.documents.nameLabel')}
              </Field.Label>
              <TextInput
                className="font-mono"
                value={value}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
              />
              {request.mode === 'new' ? (
                <Field.Description>
                  {t('taskAuthoring.documents.pathDescription')}
                </Field.Description>
              ) : null}
            </Field>
          ) : null}
          {request.mode === 'new' ? (
            <Field>
              <Field.Label>{t('taskAuthoring.documents.typeLabel')}</Field.Label>
              <Select value={type} onValueChange={setType} disabled={!types.data}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(types.data ?? []).map((documentType) => (
                    <SelectItem key={documentType.id} value={documentType.id}>
                      {documentType.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant={request.mode === 'delete' ? 'destructive' : 'primary'}
          disabled={mutation.isPending || invalid || (request.mode === 'new' && type === '')}
        >
          {copy.confirm}
        </Button>
      </DialogFooter>
    </>
  );
}
