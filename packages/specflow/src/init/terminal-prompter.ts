import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type { ReadStream, WriteStream } from 'node:tty';

import type { ProjectInitPrompter, PromptChoice } from './prompts.js';

export class TerminalProjectInitPrompter implements ProjectInitPrompter {
  readonly #input: ReadStream;
  readonly #output: WriteStream;
  #readline?: Interface;
  #muted = false;

  constructor(input: ReadStream, output: WriteStream) {
    this.#input = input;
    this.#output = output;
  }

  async select<T extends string>(message: string, choices: readonly PromptChoice<T>[]): Promise<T> {
    this.#output.write(`${message}:\n`);
    choices.forEach((choice, index) => {
      this.#output.write(`  ${String(index + 1)}. ${choice.label}\n`);
    });

    while (true) {
      const raw = (await this.#interface().question('Choose: ')).trim();
      const index = Number(raw) - 1;
      const choice = choices[index];
      if (choice) return choice.value;
    }
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const value = await this.#interface().question(`${message}${suffix}: `);
    return value.length === 0 && defaultValue !== undefined ? defaultValue : value;
  }

  async secret(message: string): Promise<string> {
    this.#output.write(`${message}: `);
    this.#muted = true;
    try {
      return await this.#interface().question('');
    } finally {
      this.#muted = false;
      this.#output.write('\n');
    }
  }

  close(): void {
    this.#readline?.close();
    this.#readline = undefined;
  }

  #interface(): Interface {
    if (this.#readline) return this.#readline;

    const proxy = new Writable({
      write: (chunk, _encoding, callback) => {
        if (!this.#muted) this.#output.write(String(chunk));
        callback();
      },
    });

    this.#readline = createInterface({
      input: this.#input,
      output: proxy,
      terminal: this.#input.isTTY,
    });
    return this.#readline;
  }
}
