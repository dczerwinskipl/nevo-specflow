import {
  FilePen,
  FilePlus,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Search,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ToolOperation } from '@nevo/specflow-contracts/sessions';

/**
 * One icon per tool operation kind (the Runtime's `operation`), the same in the Conversation's
 * work rows and in Work history, so a kind is recognised by its shape. Colour never encodes the
 * kind; it is left for the state (a failure, a warning).
 */
const operationIcons: Record<ToolOperation, LucideIcon> = {
  edit: FilePen,
  write: FilePlus,
  command: SquareTerminal,
  test: FlaskConical,
  read: FileText,
  search: Search,
  list: FolderOpen,
  web: Globe,
  other: Wrench,
};

export function workOperationIcon(operation: ToolOperation | undefined): LucideIcon {
  return operationIcons[operation ?? 'other'];
}
