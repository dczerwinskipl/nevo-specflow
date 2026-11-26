import {
  FilePen,
  FilePlus,
  FlaskConical,
  FolderOpen,
  Globe,
  Search,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import type { ToolOperation } from '@nevo/specflow-contracts/sessions';
import { productIcons } from '../../../shared/product-icons';

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
  read: productIcons.fileRead,
  search: Search,
  list: FolderOpen,
  web: Globe,
  other: productIcons.toolAction,
};

export function workOperationIcon(operation: ToolOperation | undefined): LucideIcon {
  return operationIcons[operation ?? 'other'];
}
