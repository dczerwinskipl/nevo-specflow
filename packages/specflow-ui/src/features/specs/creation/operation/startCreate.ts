import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import type { ProjectCreateRequest } from '../api/api.project';
import { retainRequest, type RequestAttempt } from '../../../../shared/operations/retainedRequest';
import type {
  CreateDraft,
  CreateOperationStorage,
  SentCreateRequest,
} from './createOperationStorage';

export interface StartCreateInput {
  /** Holds the operation id of an identical earlier submit of this form (a double click). */
  attempt: { current: RequestAttempt<SentCreateRequest> | null };
  storage: CreateOperationStorage;
  /** The form as the owner entered it; "Back to form" restores it. */
  draft: Omit<CreateDraft, 'operationId'>;
  /** Real slug override the owner typed (never an untouched default), else undefined. */
  slug?: string;
  /** Lazy: building the target may throw, and that must not escape the submit. */
  buildTarget: () => CreateSpecRequest['target'] | undefined;
  /** The archetype part of the request (archetype, version, catalogue revision, ticks). */
  selection: Pick<
    ProjectCreateRequest,
    'archetypeId' | 'archetypeVersion' | 'catalogueRevision' | 'optionalDocumentIds'
  >;
  now?: () => number;
}

/**
 * The form's whole part in a Create: it decides what is sent (retaining one operation id per
 * distinct request), persists the request and the draft, and hands the rest to the progress page.
 * It sends nothing and waits for nothing: the page owns the execution and the monitoring, so a
 * reload there resumes the same operation. Returns undefined when the request could not be
 * prepared (nothing was stored or sent, the form stays usable).
 */
export function startCreate(input: StartCreateInput): SentCreateRequest | undefined {
  const { attempt, storage, draft, slug, buildTarget, selection, now = Date.now } = input;
  let request: SentCreateRequest;
  try {
    const target = buildTarget();
    const goal = draft.goal.trim();
    request = retainRequest<SentCreateRequest, 'operationId'>(
      attempt,
      {
        title: draft.title.trim(),
        ...(goal ? { goal } : {}),
        ...(slug ? { slug } : {}),
        ...(target ? { target } : {}),
        ...selection,
      },
      undefined,
      'operationId',
    );
  } catch {
    return undefined;
  }
  storage.save({ request, startedAt: now() });
  storage.saveDraft({ ...draft, operationId: request.operationId });
  return request;
}
