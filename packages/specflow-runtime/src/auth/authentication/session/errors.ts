export type AuthStoreCapacityKind = 'session' | 'oidc_transaction';

export class AuthStoreCapacityError extends Error {
  readonly kind: AuthStoreCapacityKind;

  constructor(kind: AuthStoreCapacityKind) {
    super(`Authentication store capacity reached for ${kind} state.`);
    this.name = 'AuthStoreCapacityError';
    this.kind = kind;
  }
}
