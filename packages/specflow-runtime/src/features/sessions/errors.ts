import type { SessionErrorCode } from '@nevo/specflow-contracts/sessions';

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
    readonly details?: { turnId?: string; reason?: string; field?: string; capability?: string },
  ) {
    super(message);
    this.name = 'SessionError';
  }
  get statusCode(): number {
    if (['SESSION_NOT_FOUND', 'SESSION_RESOURCE_NOT_FOUND'].includes(this.code)) return 404;
    if (this.code === 'SESSION_PAYLOAD_TOO_LARGE') return 413;
    if (['CAPABILITY_UNSUPPORTED', 'MODEL_UNSUPPORTED'].includes(this.code)) return 422;
    if (
      ['SESSION_INPUT_INVALID', 'SESSION_CURSOR_INVALID', 'INTERACTION_RESPONSE_INVALID'].includes(
        this.code,
      )
    )
      return 400;
    if (
      [
        'TURN_CONFLICT',
        'IDEMPOTENCY_CONFLICT',
        'INTERACTION_EXPIRED',
        'SESSION_CURSOR_EXPIRED',
        'CONTENT_REVISION_UNAVAILABLE',
        'SESSION_RECOVERY_REQUIRED',
      ].includes(this.code)
    )
      return 409;
    return 503;
  }
}
