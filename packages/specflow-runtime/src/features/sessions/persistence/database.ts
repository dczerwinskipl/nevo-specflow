import type { SQLInputValue, StatementSync } from 'node:sqlite';
import type { Row } from './encoding';

/** Internal access to the one Worker-owned connection. Modules never open or transact it. */
export interface StoreDatabase {
  get(this: void, sql: string, ...args: SQLInputValue[]): Row | undefined;
  all(this: void, sql: string, ...args: SQLInputValue[]): Row[];
  run(this: void, sql: string, ...args: SQLInputValue[]): ReturnType<StatementSync['run']>;
}
