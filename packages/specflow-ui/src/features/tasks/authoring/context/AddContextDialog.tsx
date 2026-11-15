import { useId, useState, type FormEvent, type ReactNode } from 'react';
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
import { referenceKey, type TaskContextEntry } from './contextModel';
import { ProjectDocumentPicker } from './ProjectDocumentPicker';

/** The kinds the add menu offers (Task documents are added as documents of the Task). */
export type AddContextKind =
  'specification-document' | 'project-document' | 'path' | 'instructions';

export interface SpecificationDocumentOption {
  readonly id: string;
  readonly title: string;
  readonly filename?: string;
}

export interface AddContextDialogProps {
  /** Undefined: closed. */
  readonly kind: AddContextKind | undefined;
  readonly onClose: () => void;
  readonly taskId: string;
  readonly specTitle: string;
  /** The current list: references already in it are shown as added. */
  readonly existing: readonly TaskContextEntry[];
  readonly specificationDocuments: readonly SpecificationDocumentOption[];
  readonly pending: boolean;
  readonly error?: ReactNode;
  /** The new entries, appended at the end of the list by the caller. */
  readonly onAdd: (entries: readonly TaskContextEntry[]) => void;
}

/**
 * One dialog per kind (UX contract, Task authoring): whether the item is created earlier in the
 * process comes first (it decides whether the item is picked or named), then the item, when the
 * step needs it and why.
 */
export function AddContextDialog(props: AddContextDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.kind !== undefined} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        {props.kind ? <AddContextForm {...props} kind={props.kind} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddContextForm({
  kind,
  onClose,
  taskId,
  specTitle,
  existing,
  specificationDocuments,
  pending,
  error,
  onAdd,
}: AddContextDialogProps & { kind: AddContextKind }) {
  const { t } = useTranslation();
  const formId = useId();
  const [artifact, setArtifact] = useState(false);
  const [required, setRequired] = useState('required');
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const added = new Set(existing.map(referenceKey));
  const named = kind === 'path' || kind === 'instructions' || artifact;
  const missing = named ? value.trim() === '' : picked.length === 0;

  const entryFor = (reference: string): TaskContextEntry => {
    const common = {
      required: required === 'required',
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    switch (kind) {
      case 'instructions':
        return { kind, text: reference, ...common };
      case 'path':
        return { kind, path: reference, ...common, ...(artifact ? { artifact } : {}) };
      default:
        return { kind, id: reference, ...common, ...(artifact ? { artifact } : {}) };
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (missing || pending) {
      return;
    }

    onAdd(named ? [entryFor(value.trim())] : picked.map(entryFor));
  };

  const togglePicked = (id: string, checked: boolean) =>
    setPicked((current) => (checked ? [...current, id] : current.filter((other) => other !== id)));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(`taskAuthoring.context.addTitle.${kind}`)}</DialogTitle>
        <DialogDescription>
          {t('taskAuthoring.context.addDescription', { id: taskId })}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {error}
          {kind !== 'instructions' ? (
            <CheckboxField
              label={t('taskAuthoring.context.artifactLabel')}
              description={t('taskAuthoring.context.artifactDescription')}
              checked={artifact}
              onCheckedChange={(checked) => setArtifact(checked === true)}
            />
          ) : null}
          {kind === 'instructions' ? (
            <Field invalid={submitted && missing}>
              <Field.Label>{t('taskAuthoring.context.instructionsLabel')}</Field.Label>
              <TextArea rows={4} value={value} onChange={(event) => setValue(event.target.value)} />
              {submitted && missing ? (
                <Field.Error>{t('taskAuthoring.context.valueRequired')}</Field.Error>
              ) : null}
            </Field>
          ) : kind === 'path' ? (
            <Field invalid={submitted && missing}>
              <Field.Label>{t('taskAuthoring.context.pathLabel')}</Field.Label>
              <TextInput
                className="font-mono"
                value={value}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
              />
              {submitted && missing ? (
                <Field.Error>{t('taskAuthoring.context.valueRequired')}</Field.Error>
              ) : (
                <Field.Description>{t('taskAuthoring.context.pathDescription')}</Field.Description>
              )}
            </Field>
          ) : artifact ? (
            // An artifact does not exist yet: it is named instead of picked.
            <Field invalid={submitted && missing}>
              <Field.Label>{t('taskAuthoring.context.documentIdLabel')}</Field.Label>
              <TextInput
                className="font-mono"
                value={value}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
              />
              {submitted && missing ? (
                <Field.Error>{t('taskAuthoring.context.valueRequired')}</Field.Error>
              ) : (
                <Field.Description>
                  {t('taskAuthoring.context.documentIdDescription')}
                </Field.Description>
              )}
            </Field>
          ) : kind === 'specification-document' ? (
            <fieldset className="grid gap-3">
              <legend className="mb-3 text-label-sm text-content-primary">
                {t('taskAuthoring.context.specificationLegend', { spec: specTitle })}
              </legend>
              {specificationDocuments.map((document) => {
                const inContext = added.has(`specification-document:${document.id}`);

                return (
                  <CheckboxField
                    key={document.id}
                    label={document.title}
                    description={[
                      document.filename,
                      inContext ? t('taskAuthoring.context.alreadyInContext') : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    checked={inContext || picked.includes(document.id)}
                    disabled={inContext}
                    onCheckedChange={(checked) => togglePicked(document.id, checked === true)}
                  />
                );
              })}
            </fieldset>
          ) : (
            <ProjectDocumentPicker
              picked={picked}
              added={(id) => added.has(`project-document:${id}`)}
              onToggle={togglePicked}
            />
          )}
          {submitted && missing && !named ? (
            <InlineNote tone="danger">{t('taskAuthoring.context.nothingChosen')}</InlineNote>
          ) : null}
          <div className="grid gap-2">
            <Typography as="p" variant="label-sm" id={`${formId}-required`}>
              {t('taskAuthoring.context.whenStarts')}
            </Typography>
            <RadioGroup
              value={required}
              onValueChange={setRequired}
              aria-labelledby={`${formId}-required`}
            >
              <RadioGroupOption
                value="required"
                label={t('taskAuthoring.context.required')}
                description={t('taskAuthoring.context.requiredDescription')}
              />
              <RadioGroupOption
                value="optional"
                label={t('taskAuthoring.context.optional')}
                description={t('taskAuthoring.context.optionalDescription')}
              />
            </RadioGroup>
          </div>
          <Field>
            <Field.Label>{t('taskAuthoring.context.noteLabel')}</Field.Label>
            <TextInput value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={pending}>
          {t('taskAuthoring.context.confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
