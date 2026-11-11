import type { StoreWriteFailed } from '../vector-store';

/** The Node error code of a file-system error, when it has one. */
export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;

  return typeof code === 'string' ? code : undefined;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function writeFailed(context: string, error: unknown): StoreWriteFailed {
  return { status: 'write-failed', message: `${context}: ${messageOf(error)}` };
}
