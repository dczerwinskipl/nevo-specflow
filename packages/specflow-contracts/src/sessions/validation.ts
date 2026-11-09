import { Value } from 'typebox/value';
import {
  SessionSnapshotSchema,
  HistoryPageSchema,
  WorkPageSchema,
  ActionPageSchema,
  ContentPageSchema,
  SessionChangeSchema,
} from './model';
import {
  ProviderCatalogueSchema,
  CreateSessionResultSchema,
  StartTurnResultSchema,
  CancelTurnResultSchema,
  RespondInteractionResultSchema,
  ReconcileTurnResultSchema,
} from './commands';
import { SessionCommandResultSchema } from './management';
import { RefreshTelemetryReceiptSchema, validateTelemetrySnapshot } from './telemetry';
import { CreateContextSessionResultSchema, SessionAssociationReadSchema } from './associations';
import { SessionListPageSchema } from './list';

export const sessionValidators = {
  telemetry: validateTelemetrySnapshot,
  refreshTelemetryReceipt: (value: unknown) => Value.Check(RefreshTelemetryReceiptSchema, value),
  snapshot: (value: unknown) => Value.Check(SessionSnapshotSchema, value),
  history: (value: unknown) => Value.Check(HistoryPageSchema, value),
  work: (value: unknown) => Value.Check(WorkPageSchema, value),
  actions: (value: unknown) => Value.Check(ActionPageSchema, value),
  content: (value: unknown) => Value.Check(ContentPageSchema, value),
  event: (value: unknown) => Value.Check(SessionChangeSchema, value),
  providers: (value: unknown) => Value.Check(ProviderCatalogueSchema, value),
  sessionCommandResult: (value: unknown) => Value.Check(SessionCommandResultSchema, value),
  createResult: (value: unknown) => Value.Check(CreateSessionResultSchema, value),
  startResult: (value: unknown) => Value.Check(StartTurnResultSchema, value),
  cancelResult: (value: unknown) => Value.Check(CancelTurnResultSchema, value),
  respondResult: (value: unknown) => Value.Check(RespondInteractionResultSchema, value),
  reconcileResult: (value: unknown) => Value.Check(ReconcileTurnResultSchema, value),
  createContextResult: (value: unknown) => Value.Check(CreateContextSessionResultSchema, value),
  association: (value: unknown) => Value.Check(SessionAssociationReadSchema, value),
  list: (value: unknown) => Value.Check(SessionListPageSchema, value),
};
