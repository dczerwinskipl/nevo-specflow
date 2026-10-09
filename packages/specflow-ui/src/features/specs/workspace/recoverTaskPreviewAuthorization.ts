/** Route-level recovery for a 401 from Task Preview detail.
 * The list/preview feature does not own navigation or authentication.
 */
export async function recoverTaskPreviewAuthorization({
  refresh,
  retry,
  onLogin,
  onRuntimeUnavailable,
}: {
  readonly refresh: () => Promise<{
    readonly authenticationRequired: boolean;
    readonly authenticated: boolean;
  }>;
  readonly retry: () => void;
  readonly onLogin: () => void;
  readonly onRuntimeUnavailable: () => void;
}): Promise<void> {
  try {
    const session = await refresh();
    if (session.authenticationRequired && !session.authenticated) {
      onLogin();
    } else {
      retry();
    }
  } catch {
    onRuntimeUnavailable();
  }
}
