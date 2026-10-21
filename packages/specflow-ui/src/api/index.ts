/** Foundation of every Runtime integration: classified errors and the transport that raises them. */
export {
  ApiError,
  apiErrorKinds,
  isApiError,
  type ApiErrorInit,
  type ApiErrorKind,
  type ApiErrorReason,
  type MutationOutcome,
} from './ApiError';
export { classifyHttpError, readServerCode, type ClassifyContext } from './classify';
export { commonErrorCodes, type ErrorCodeRule, type ErrorCodeTable } from './codes/common';
export {
  createApiTransport,
  type ApiRequestOptions,
  type ApiTransport,
  type ApiTransportContext,
} from './transport';
