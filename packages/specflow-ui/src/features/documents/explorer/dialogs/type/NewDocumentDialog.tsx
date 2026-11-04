import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@nevo/ui';
import { useMessage } from '../../../../../i18n/message';
import {
  archetypeTitle,
  defaultFileName,
  initialTypeChoice,
  typeChoices,
} from '../../../catalogue/documentTypePolicy';
import { DocumentTypeChooser, DocumentTypeGuidance, noTypeValue } from './DocumentTypeChooser';
import {
  entryNameError,
  finalEntryName,
  joinDocumentPath,
  pathCollides,
} from '../../tree/documentTreePolicy';
import type { NewDocumentInput, TypeOperationOutcome } from '../../useDocumentOperations';
import {
  CatalogueStatus,
  OperationError,
  TypeDialogFrame,
  choiceOf,
  type CommonProps,
} from './TypeDialogFrame';

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
            disabled={busy || unknown}
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
