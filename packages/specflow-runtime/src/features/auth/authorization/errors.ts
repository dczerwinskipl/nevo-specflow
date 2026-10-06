export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication is required.');
    this.name = 'AuthenticationRequiredError';
  }
}

export class AuthorizationForbiddenError extends Error {
  constructor() {
    super('The current subject does not have the required capability.');
    this.name = 'AuthorizationForbiddenError';
  }
}
