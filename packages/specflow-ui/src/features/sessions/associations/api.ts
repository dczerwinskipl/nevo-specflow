import type { HttpRequestClient } from '@nevo/http-client';
import {
  sessionValidators,
  type CreateContextSession,
  type CreateContextSessionResult,
  type SessionAssociationRead,
  type SessionListArchived,
  type SessionListPage,
} from '@nevo/specflow-contracts/sessions';
import { asApiError, createApiTransport } from '../../../api';
import { sessionErrorCodes } from '../managed/api';

/** The Session list read a Specification's Sessions list pages through (`GET /api/sessions`). */
export interface SpecificationSessionListQuery {
  specId: string;
  archived: Exclude<SessionListArchived, 'include'>;
  cursor?: string;
  limit?: number;
}

/**
 * The Session association reads and the composed create of a project Runtime (stage 3): which
 * Specification and Tasks a Session is associated with, the Sessions of one Specification, and
 * starting a Session in a Specification.
 */
export interface SessionAssociationsApi {
  /** `GET /api/sessions/:sessionId/association`. */
  association(sessionId: string, signal?: AbortSignal): Promise<SessionAssociationRead>;
  /** `GET /api/sessions?specId=&archived=&cursor=`: one page, possibly empty while a cursor remains. */
  list(query: SpecificationSessionListQuery, signal?: AbortSignal): Promise<SessionListPage>;
  /** `POST /api/specs/:specId/sessions`: a Session associated with the Specification. */
  createInSpecification(
    specId: string,
    input: CreateContextSession,
  ): Promise<CreateContextSessionResult>;
}

export const sessionAssociationsOperation = 'sessions.associations';

/**
 * A read refused for good (403 or 404): the principal may no longer see what an earlier read
 * returned, so that data leaves the view. Any other failure is transient and keeps it.
 */
export function isDefinitiveAssociationRefusal(error: unknown): boolean {
  const status = asApiError(error, {
    operation: sessionAssociationsOperation,
    method: 'GET',
  })?.status;

  return status === 403 || status === 404;
}

export function createSessionAssociationsApi(http: HttpRequestClient): SessionAssociationsApi {
  const api = createApiTransport(http, {
    operation: sessionAssociationsOperation,
    codes: sessionErrorCodes,
  });

  return {
    association: (sessionId, signal) =>
      api.get('/api/sessions/' + encodeURIComponent(sessionId) + '/association', {
        signal,
        isValid: sessionValidators.association,
      }),
    list: ({ specId, archived, cursor, limit }, signal) =>
      api.get('/api/sessions', {
        signal,
        params: {
          specId,
          archived,
          ...(cursor ? { cursor } : {}),
          ...(limit ? { limit } : {}),
        },
        isValid: sessionValidators.list,
      }),
    createInSpecification: (specId, input) =>
      api.post('/api/specs/' + encodeURIComponent(specId) + '/sessions', input, {
        isValid: sessionValidators.createContextResult,
      }),
  };
}
