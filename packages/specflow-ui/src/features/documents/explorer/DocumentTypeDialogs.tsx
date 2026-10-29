import type { ArchetypeCatalogue, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  TextInput,
} from '@nevo/ui';
import { useMessage } from '../../../i18n/message';
import {
  archetypeTitle,
  defaultFileName,
  initialTypeChoice,
  typeChoices,
  type TypeChoice,
} from '../catalogue/documentTypePolicy';
import { DocumentTypeChooser, DocumentTypeGuidance, noTypeValue } from './DocumentTypeChooser';
import {
  entryNameError,
  finalEntryName,
  joinDocumentPath,
  pathCollides,
} from './documentTreePolicy';
import type { NewDocumentInput, TypeOperationOutcome } from './useDocumentOperations';

/** The catalogue as the dialogs need it: its data and how to retry a failed read. */
export interface CatalogueState {
  data?: ArchetypeCatalogue;
  isPending: boolean;
  retry: () => void;
}

/** A failure of the dialog's operation, already translated; `resume` offers the same operation again. */
export interface TypeDialogError {
  message: string;
  resume?: boolean;
}

interface CommonProps {
  tree: Tree;
  catalogue: CatalogueState;
  /** The operation is in flight. */
  busy: boolean;
  /** Its outcome is unknown: the dialog cannot be left until it is checked. */
  unknown: boolean;
  error?: TypeDialogError;
  onClose: () => void;
}

/** Loading and failure of the catalogue inside a chooser dialog (the rest stays usable). */
function CatalogueStatus({ catalogue }: { catalogue: CatalogueState }) {
  const { t } = useTranslation();
  if (catalogue.data) {
    return null;
  }

  if (catalogue.isPending) {
    return (
      <p role="status" className="text-body-sm text-content-muted">
        {t('documents.newDocument.loadingTypes')}
      </p>
    );
  }

  return (
    <Alert tone="attention" title={t('documents.newDocument.typesFailed')}>
      <Button size="sm" variant="secondary" onClick={catalogue.retry}>
        {t('common.retry')}
      </Button>
    </Alert>
  );
}

function OperationError({
  error,
  busy,
  onResume,
}: {
  error?: TypeDialogError;
  busy: boolean;
  onResume: () => void;
}) {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }

  return (
    <Alert
      role="alert"
      tone="attention"
      title={error.message}
      actions={
        error.resume ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onResume}>
            {t('documents.tree.error.resume')}
          </Button>
        ) : undefined
      }
    />
  );
}

function TypeDialogFrame({
  open,
  busy,
  unknown,
  title,
  description,
  body,
  footerError,
  submitLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  unknown: boolean;
  title: string;
  description: string;
  body: ReactNode;
  footerError: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy && !unknown) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">{body}</DialogBody>
        {footerError}
        <DialogFooter>
          <Button variant="secondary" disabled={busy || unknown} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const choiceOf = (all: readonly TypeChoice[], id: string) =>
  all.find((choice) => choice.type.id === id);

/**
 * New document: the type (grouped chooser with "use when"), a pre-filled editable file name and the
 * type's instructions behind a disclosure. A failure keeps the dialog, the type and the name.
 */
export function NewDocumentDialog({
  request,
  specificationTitle,
  onSubmit,
  ...common
}: CommonProps & {
  /** The folder to create in (`''` is the main folder) and the type asked for (Add). */
  request: { folder: string; type?: string };
  specificationTitle: string;
  onSubmit: (input: NewDocumentInput) => Promise<TypeOperationOutcome>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const { tree, catalogue, busy, unknown, error, onClose } = common;
  const nameRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string>();
  const [typedName, setTypedName] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const choices = typeChoices(catalogue.data, tree);
  const all = [...choices.suggested, ...choices.other];
  const type = picked ?? initialTypeChoice(choices, request.type) ?? noTypeValue;
  const choice = type === noTypeValue ? undefined : choiceOf(all, type);
  // Changing the type replaces the name only while the user has not edited it.
  const name = typedName ?? defaultFileName(choice);
  const finalName = finalEntryName(name, 'document');
  const path = joinDocumentPath(request.folder, finalName);
  const files = [...tree.documents, ...tree.dangling].map((document) => document.path);
  const nameError =
    entryNameError(name, 'document', tree.capabilities.formats) ??
    (name.trim() === ''
      ? submitted
        ? { key: 'documents.newDocument.nameRequired' as const }
        : undefined
      : pathCollides(
            path,
            files,
            tree.folders.map((folder) => folder.path),
          )
        ? { key: 'documents.tree.error.pathConflict' as const }
        : undefined);

  const submit = async () => {
    setSubmitted(true);
    if (busy || nameError || name.trim() === '') {
      nameRef.current?.focus();

      return;
    }

    const outcome = await onSubmit({
      path,
      ...(choice ? { type: choice.type.id } : {}),
      ...(choice?.template ? { templateId: choice.template.id } : {}),
      title: choice?.type.title,
    });
    if (!outcome.ok && outcome.focusName) {
      nameRef.current?.focus();
    }
  };

  return (
    <TypeDialogFrame
      open
      busy={busy}
      unknown={unknown}
      title={t('documents.newDocument.title')}
      description={
        request.folder
          ? t('documents.newDocument.inFolder', { folder: request.folder })
          : t('documents.newDocument.inRoot', { specification: specificationTitle })
      }
      submitLabel={t('documents.newDocument.create')}
      onSubmit={() => void submit()}
      onClose={onClose}
      footerError={<OperationError error={error} busy={busy} onResume={() => void submit()} />}
      body={
        <>
          <CatalogueStatus catalogue={catalogue} />
          <DocumentTypeChooser
            choices={choices}
            value={type}
            onChange={setPicked}
            archetype={archetypeTitle(tree, catalogue.data)}
            allowNone
          />
          <Field invalid={Boolean(nameError)}>
            <Field.Label>{t('documents.newDocument.fileName')}</Field.Label>
            <TextInput
              ref={nameRef}
              value={name}
              disabled={busy || unknown}
              spellCheck={false}
              onChange={(event) => setTypedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            {nameError ? (
              <Field.Error>{text(nameError)}</Field.Error>
            ) : (
              <Field.Description>{t('documents.newDocument.fileNameHelp')}</Field.Description>
            )}
          </Field>
          <DocumentTypeGuidance choice={choice} />
        </>
      }
    />
  );
}

/** Assign type: the same chooser without "No type" and without a file name. */
export function AssignTypeDialog({
  request,
  onSubmit,
  ...common
}: CommonProps & {
  request: { id: string; path: string };
  onSubmit: (type: string, title: string) => Promise<TypeOperationOutcome>;
}) {
  const { t } = useTranslation();
  const { tree, catalogue, busy, unknown, error, onClose } = common;
  const [picked, setPicked] = useState<string>();
  const choices = typeChoices(catalogue.data, tree);
  const all = [...choices.suggested, ...choices.other];
  const type = picked ?? initialTypeChoice(choices) ?? '';
  const choice = choiceOf(all, type);
  const submit = () => {
    if (!busy && choice) {
      void onSubmit(choice.type.id, choice.type.title);
    }
  };

  return (
    <TypeDialogFrame
      open
      busy={busy}
      unknown={unknown}
      title={t('documents.classify.title')}
      description={t('documents.classify.description', { path: request.path })}
      submitLabel={t('documents.classify.confirm')}
      onSubmit={submit}
      onClose={onClose}
      footerError={<OperationError error={error} busy={busy} onResume={submit} />}
      body={
        <>
          <CatalogueStatus catalogue={catalogue} />
          <DocumentTypeChooser
            choices={choices}
            value={type}
            onChange={setPicked}
            archetype={archetypeTitle(tree, catalogue.data)}
            allowNone={false}
          />
          <DocumentTypeGuidance choice={choice} />
        </>
      }
    />
  );
}
