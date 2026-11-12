/** A type with the `readonly` markers of the Engine's results removed, as the contract types are. */
export type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
      : T;

/**
 * An Engine result as the contract type: only the `readonly` markers are removed, nothing is converted.
 * The response schema checks the shape at compile time in one direction (the reply type); the
 * contract test (`contract-types.test.ts`) checks both directions, so a field either side adds or
 * changes fails there.
 */
export function toWire<T>(value: T): Mutable<T> {
  return value as Mutable<T>;
}
