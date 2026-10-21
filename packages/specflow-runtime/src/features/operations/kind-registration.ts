import type { OperationKind } from '@nevo/specflow-contracts/operations';
import type { FastifyRequest } from 'fastify';

/**
 * How an operation kind joins the generic progress endpoint. The owning feature supplies the
 * authorization of its kind, so the endpoint never learns product capabilities.
 */
export interface OperationKindRegistration {
  readonly kind: OperationKind;
  /** Throws an authentication/authorization error (rendered by the Runtime error handler). */
  authorize(request: FastifyRequest): void | Promise<void>;
}
