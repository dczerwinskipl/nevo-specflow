import { Type } from 'typebox';

/**
 * Identifiers of the Specification domain that several Runtime operations share. The `title` is
 * the identifier's name: the Runtime OpenAPI document publishes each as one component of that name
 * and references it wherever the schema is used. It is an annotation only; validation is the
 * schema's own (a nested `$id` would make one request schema resolve the same id twice).
 */

/** The id pattern of Specification reads (existing id pattern, at most 200 characters). */
const ID_OPTIONS = {
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
} as const;

/** A Specification id as Specification, Task, document and Session association routes accept it. */
export const SpecIdSchema = Type.String({ ...ID_OPTIONS, title: 'SpecId' });

/** A Task id of a Specification. */
export const TaskIdSchema = Type.String({ ...ID_OPTIONS, title: 'TaskId' });

/** A registered checkout (primary repository or linked worktree): an RFC 4122 UUID, any case. */
export const WorkspaceIdSchema = Type.String({
  title: 'WorkspaceId',
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});
