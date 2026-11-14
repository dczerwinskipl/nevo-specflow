import { ContentsButton } from '../../../shared/document-reading/ContentsButton';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';

/**
 * The contents of the previewed document. It is region navigation (like Back and the document
 * switcher), not a header action: it takes no direct slot of the action budget.
 * - Without a contents column (narrow panel) it opens the contents as a sheet.
 * - While the contents column and the guidance share one slot it is a toggle (pressed while the
 *   contents column is shown; pressing it there hides the guidance).
 * - With room for both columns it does not exist: the contents are always a column.
 */
export function OutlineButton() {
  const session = useDocumentEditor();
  const toggle = session?.contentsToggle;
  if (toggle) {
    return <ContentsButton mode="toggle" pressed={toggle.pressed} onToggle={toggle.toggle} />;
  }

  if (!session?.outlineAvailable) {
    return null;
  }

  return (
    <ContentsButton mode="sheet" expanded={session.outlineOpen} onOpen={session.openOutline} />
  );
}
