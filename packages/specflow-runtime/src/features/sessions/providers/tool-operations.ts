import type { ToolOperation } from '@nevo/specflow-contracts/sessions';

/**
 * A provider's own tool identity mapped to the canonical ToolAction operation. Classification uses
 * only this exact native identity (never command text, arguments or titles); an identity the
 * table does not list is `other`.
 */
export type NativeToolOperations = Readonly<Record<string, ToolOperation>>;

export function nativeToolOperation(table: NativeToolOperations, identity: string): ToolOperation {
  return Object.hasOwn(table, identity) ? table[identity]! : 'other';
}
