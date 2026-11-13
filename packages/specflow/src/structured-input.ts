import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { InvalidArgumentError } from 'commander';
import { parse } from 'yaml';

/** A YAML or JSON file (JSON is YAML) given to an option; the Engine validates the shape. */
export async function readStructuredFile(
  cwd: string,
  path: string,
  what: string,
): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(resolve(cwd, path), 'utf8');
  } catch (error) {
    throw new InvalidArgumentError(
      `Cannot read ${what} file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return parse(text) as unknown;
  } catch (error) {
    throw new InvalidArgumentError(
      `The ${what} file ${path} is not valid YAML or JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** A whole number of at least 1 (an attempt number). */
export function parsePositiveInt(value: string): number {
  if (!/^[1-9][0-9]{0,8}$/u.test(value)) {
    throw new InvalidArgumentError('Must be a whole number, at least 1.');
  }

  return Number(value);
}
