import { Value } from 'typebox/value';
import {
  SessionSnapshotSchema,
  HistoryPageSchema,
  WorkPageSchema,
  ActionPageSchema,
  ContentPageSchema,
  SessionChangeSchema,
} from './model';
import { ProviderCatalogueSchema } from './commands';
import { RefreshTelemetryReceiptSchema, validateTelemetrySnapshot } from './telemetry';

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
};
