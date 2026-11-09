import { Type, type Static } from 'typebox';
import { SessionIdSchema, SessionInfoSchema } from './model';

const closed = { additionalProperties: false } as const;

/** Raw title bound; Runtime stores the trimmed value, which must stay nonblank. */
export const SessionTitleSchema = Type.String({ minLength: 1, maxLength: 256, pattern: '\\S' });
export const RenameSessionSchema = Type.Object(
  { requestId: SessionIdSchema, title: SessionTitleSchema },
  closed,
);
/** Shared by archive and unarchive; each command keeps its own idempotency scope. */
export const ArchiveSessionSchema = Type.Object({ requestId: SessionIdSchema }, closed);
/** Rename, archive and unarchive return the current effective Session projection. */
export const SessionCommandResultSchema = Type.Object(
  { session: SessionInfoSchema },
  { ...closed, $id: 'SessionCommandResult' },
);

export type RenameSession = Static<typeof RenameSessionSchema>;
export type ArchiveSession = Static<typeof ArchiveSessionSchema>;
export type SessionCommandResult = Static<typeof SessionCommandResultSchema>;
