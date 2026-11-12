/** A type with the `readonly` markers of the Engine's results removed, as the contract types are. */
export type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
      : T;

/**
 * An Engine result as the contract type. Only the `readonly` markers differ, so the response schema
 * still checks the shape at compile time: a field the contract does not describe, or of another
 * type, is a type error here.
 */
export function toWire<T>(value: T): Mutable<T> {
  return value as Mutable<T>;
}
