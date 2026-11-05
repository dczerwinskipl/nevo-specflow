import type { DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import type { DocumentOperationsActions } from '../../useDocumentOperations';
import { AssignTypeDialog } from './AssignTypeDialog';
import { NewDocumentDialog } from './NewDocumentDialog';
import type { CatalogueState } from './TypeDialogFrame';
import type { TypeRequest } from './typeRequest';

/** Whichever of New document and Assign type is requested; each request mounts a fresh dialog. */
export function TypeDialogs({
  request,
  tree,
  catalogue,
  specificationTitle,
  busy,
  unknown,
  error,
  resumable,
  operations,
  onClose,
  onDone,
}: {
  request?: TypeRequest;
  tree: Tree;
  catalogue: CatalogueState;
  specificationTitle: string;
  busy: boolean;
  unknown: boolean;
  /** The operation's failure, already translated. */
  error: string;
  resumable: boolean;
  operations: Pick<DocumentOperationsActions, 'createDocument' | 'classify'>;
  /** Dismissed without a result. */
  onClose: () => void;
  /** The operation succeeded; `focus` is the tree key that takes focus, when the row stays. */
  onDone: (focus?: string) => void;
}) {
  const dialogError = error ? { message: error, resume: resumable } : undefined;

  if (request?.kind === 'new') {
    return (
      <NewDocumentDialog
        key={request.key}
        tree={tree}
        catalogue={catalogue}
        specificationTitle={specificationTitle}
        request={request}
        busy={busy}
        unknown={unknown}
        error={dialogError}
        onClose={onClose}
        // Focus moves into the new document's tab (the tree operations do that).
        onSubmit={(input) => operations.createDocument(input, () => onDone())}
      />
    );
  }

  if (request?.kind === 'classify') {
    return (
      <AssignTypeDialog
        key={request.key}
        tree={tree}
        catalogue={catalogue}
        request={request}
        busy={busy}
        unknown={unknown}
        error={dialogError}
        onClose={onClose}
        onSubmit={(type, title) =>
          operations.classify(request, type, title, (id) =>
            // Focus stays on the row, now under its new id.
            onDone('doc:' + (id ?? request.id)),
          )
        }
      />
    );
  }

  return null;
}
