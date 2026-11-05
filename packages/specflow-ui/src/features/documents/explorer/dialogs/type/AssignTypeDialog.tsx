import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  archetypeTitle,
  initialTypeChoice,
  typeChoices,
} from '../../../catalogue/documentTypePolicy';
import { DocumentTypeChooser, DocumentTypeGuidance } from './DocumentTypeChooser';
import type { TypeOperationOutcome } from '../../useDocumentOperations';
import {
  CatalogueStatus,
  OperationError,
  TypeDialogFrame,
  choiceOf,
  type CommonProps,
} from './TypeDialogFrame';

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
            disabled={busy || unknown}
            archetype={archetypeTitle(tree, catalogue.data)}
            allowNone={false}
          />
          <DocumentTypeGuidance choice={choice} />
        </>
      }
    />
  );
}
