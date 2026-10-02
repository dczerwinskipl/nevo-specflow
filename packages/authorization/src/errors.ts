export class AuthorizationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationConfigurationError';
  }
}
