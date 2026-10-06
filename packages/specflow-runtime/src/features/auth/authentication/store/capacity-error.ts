export type AuthenticationStoreCapacityKind = 'session' | 'oidc_transaction';

export class AuthenticationStoreCapacityError extends Error {
  readonly kind: AuthenticationStoreCapacityKind;

  constructor(kind: AuthenticationStoreCapacityKind) {
    super(`Authentication store capacity reached for ${kind} state.`);
    this.name = 'AuthenticationStoreCapacityError';
    this.kind = kind;
  }
}
