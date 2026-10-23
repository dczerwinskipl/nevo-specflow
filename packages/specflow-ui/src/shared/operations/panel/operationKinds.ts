import type { Message } from '../../../i18n/message';
import type { OperationListItem } from '../operationList';

/**
 * How one kind of operation is shown in a list. The kind's own feature owns this (copy of its step
 * vocabulary, the pages of its operation); the panel only draws what it is given. The server sends
 * no link or copy, so every kind adapter derives them from `kind + operationId` and public codes.
 */
export interface OperationKindPresentation {
  /** The wire `kind` this adapter presents. */
  readonly kind: string;
  /** What kind of operation it is ("Creating a specification"). */
  readonly label: Message;
  /** User-language title of a public step id; an id this build does not know reads generically. */
  readonly stepTitle: (stepId: string) => Message;
  /** The page of the operation; undefined leaves the row without a link. */
  readonly detailHref: (row: OperationListItem) => string | undefined;
  /** The operation's live progress stream, for detail pages and later consumers. */
  readonly eventsUrl?: (row: OperationListItem) => string | undefined;
}

export type OperationKindRegistry = readonly OperationKindPresentation[];

/** Unknown kinds have no adapter: they render a generic, non-linked row. */
export function findOperationKind(
  registry: OperationKindRegistry,
  kind: string,
): OperationKindPresentation | undefined {
  return registry.find((entry) => entry.kind === kind);
}
