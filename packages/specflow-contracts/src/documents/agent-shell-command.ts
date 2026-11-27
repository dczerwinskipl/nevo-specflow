/**
 * A strict parser for the shell commands an agent's provider asks the host to approve (D20). It reads
 * a command the way a POSIX shell (bash, Git Bash on Windows) splits it into words and operators, for
 * a deliberately small subset of the language: simple commands of literal words joined by `&&`, `;`,
 * `|` or new lines, file redirections, and here-documents with a quoted delimiter (whose body the
 * shell does not expand). Everything outside that subset is refused, never guessed: parameter and
 * command expansion (`$`, backticks), subshells and groups (`( )`, `{ }`), globs (`* ? [`), tilde
 * and brace expansion, comments, `||`, background `&`, here-strings, process substitution and any
 * control character. The result is the literal argument vector of each command, so the caller judges
 * exactly what the shell would run.
 */

/** One redirection of a command: an output or input file, or a duplicated descriptor (`2>&1`). */
export type ShellRedirection =
  | {
      readonly kind: 'file';
      readonly fd: number;
      readonly operator: '>' | '>>' | '<';
      /** The literal target word. */
      readonly target: string;
    }
  | { readonly kind: 'duplicate'; readonly fd: number; readonly to: number }
  | { readonly kind: 'heredoc'; readonly fd: number };

export interface ShellCommand {
  /** The literal words, quotes removed. */
  readonly argv: readonly string[];
  readonly redirections: readonly ShellRedirection[];
  /** The operator that joins this command to the next one; absent for the last command. */
  readonly next?: '&&' | ';' | '|';
}

export type ShellParse =
  | { readonly kind: 'parsed'; readonly commands: readonly ShellCommand[] }
  | { readonly kind: 'refused'; readonly reason: string };

class Refusal extends Error {}

const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

/** Characters that end an unquoted word. */
const METACHARACTERS = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')']);
/** Unquoted characters that would expand or start a construct outside the subset. */
const EXPANDING: Readonly<Record<string, string>> = {
  $: 'a "$" expansion',
  '`': 'a backtick command substitution',
  '*': 'a glob',
  '?': 'a glob',
  '[': 'a glob',
  '{': 'a brace group or brace expansion',
  '}': 'a brace group or brace expansion',
};
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

type Token =
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'operator'; readonly value: '&&' | ';' | '|' | '\n' }
  | { readonly kind: 'redirection'; readonly redirection: ShellRedirection };

/** Splits `command` into words, operators and redirections; throws a `Refusal` outside the subset. */
function tokenize(command: string): Token[] {
  if (CONTROL.test(command)) {
    refuse('It contains a control character.');
  }

  const tokens: Token[] = [];
  /** Here-documents whose bodies start after the current line: their delimiters, in order. */
  const pendingBodies: string[] = [];
  let index = 0;

  const readHeredocBodies = () => {
    // `index` is just after a new line: each pending body runs to a line equal to its delimiter.
    for (const delimiter of pendingBodies.splice(0)) {
      for (;;) {
        if (index >= command.length) {
          refuse(`The here-document ${delimiter} is not terminated.`);
        }

        const end = command.indexOf('\n', index);
        const line = command.slice(index, end === -1 ? command.length : end);
        index = end === -1 ? command.length : end + 1;
        if (line === delimiter) {
          break;
        }
      }
    }
  };

  /** One word from `index`: quotes removed; refuses anything that would expand. */
  const readWord = (): string => {
    let value = '';
    const start = index;
    while (index < command.length) {
      const character = command[index]!;
      if (METACHARACTERS.has(character)) {
        break;
      }

      if (character === "'") {
        const close = command.indexOf("'", index + 1);
        if (close === -1) {
          refuse('A single quote is not closed.');
        }

        value += command.slice(index + 1, close);
        index = close + 1;
        continue;
      }

      if (character === '"') {
        index++;
        for (;;) {
          if (index >= command.length) {
            refuse('A double quote is not closed.');
          }

          const inner = command[index]!;
          if (inner === '"') {
            index++;
            break;
          }

          if (inner === '$' || inner === '`') {
            refuse(
              `It has ${inner === '$' ? 'a "$" expansion' : 'a backtick'} inside double quotes.`,
            );
          }

          if (inner === '\\') {
            const escaped = command[index + 1];
            if (escaped === undefined) {
              refuse('A double quote is not closed.');
            }

            // Inside double quotes a backslash escapes only these; before anything else it is kept.
            if (escaped === '\n') {
              index += 2;
            } else if (escaped === '$' || escaped === '`' || escaped === '"' || escaped === '\\') {
              value += escaped;
              index += 2;
            } else {
              value += '\\';
              index++;
            }

            continue;
          }

          value += inner;
          index++;
        }

        continue;
      }

      if (character === '\\') {
        const escaped = command[index + 1];
        if (escaped === undefined) {
          refuse('It ends with a backslash.');
        }

        // A backslash-newline joins lines; any other escaped character is literal.
        if (escaped !== '\n') {
          value += escaped;
        }

        index += 2;
        continue;
      }

      const expanding = EXPANDING[character];
      if (expanding) {
        refuse(`It has ${expanding}.`);
      }

      // An unquoted tilde anywhere: bash expands it at a word's start and after `=` or `:` in
      // assignment-like words (`a=~/x`, `--file=~/x`), so it is never judged as literal text.
      if (character === '~') {
        refuse('It has a tilde expansion.');
      }

      if (index === start && (character === '#' || character === '!')) {
        refuse(
          character === '#' ? 'It has a comment.' : 'It has a "!" negation or history expansion.',
        );
      }

      value += character;
      index++;
    }

    if (index === start) {
      refuse('A word is missing.');
    }

    return value;
  };

  /** The literal target of a redirection or the delimiter of a here-document. */
  const readTarget = (): { value: string; raw: string } => {
    while (command[index] === ' ' || command[index] === '\t') {
      index++;
    }

    const start = index;
    const value = readWord();

    return { value, raw: command.slice(start, index) };
  };

  while (index < command.length) {
    const character = command[index]!;
    if (character === ' ' || character === '\t') {
      index++;
      continue;
    }

    if (character === '\n') {
      index++;
      tokens.push({ kind: 'operator', value: '\n' });
      readHeredocBodies();
      continue;
    }

    const rest = command.slice(index);
    if (rest.startsWith('&&')) {
      tokens.push({ kind: 'operator', value: '&&' });
      index += 2;
      continue;
    }

    if (rest.startsWith('||')) {
      refuse('It has "||".');
    }

    if (character === '&' && rest[1] !== '>') {
      refuse('It runs a command in the background ("&").');
    }

    if (rest.startsWith(';;')) {
      refuse('It has ";;".');
    }

    if (character === ';' || character === '|') {
      tokens.push({ kind: 'operator', value: character });
      index++;
      continue;
    }

    if (character === '(' || character === ')') {
      refuse('It has a subshell or a process substitution.');
    }

    // A redirection, with an optional descriptor number written directly before it (`2>`).
    const redirection = /^(\d*)(&>|>>|>&|>\||>\(|>|<<<|<<-|<<|<&|<>|<\(|<)/.exec(rest);
    if (redirection) {
      const [whole, digits = '', operator = ''] = redirection;
      index += whole.length;
      const fd = digits === '' ? (operator.startsWith('<') ? 0 : 1) : Number(digits);
      if (!Number.isSafeInteger(fd) || fd > 9) {
        refuse('It redirects an unusual file descriptor.');
      }

      switch (operator) {
        case '>':
        case '>>':
        case '<':
          tokens.push({
            kind: 'redirection',
            redirection: { kind: 'file', fd, operator, target: readTarget().value },
          });
          break;
        case '>&': {
          const target = /^([0-9])(?=$|[ \t\n;&|])/.exec(command.slice(index));
          if (!target) {
            refuse('It duplicates a descriptor to something other than a descriptor number.');
          }

          tokens.push({
            kind: 'redirection',
            redirection: { kind: 'duplicate', fd, to: Number(target![1]) },
          });
          index += 1;
          break;
        }

        case '<<': {
          const delimiter = readTarget();
          // Only a quoted delimiter keeps the body literal; an unquoted one expands it.
          if (!/^(?:'[^']*'|"[^"$`\\]*")$/.test(delimiter.raw) || delimiter.value === '') {
            refuse("A here-document must have a quoted delimiter, for example <<'EOF'.");
          }

          pendingBodies.push(delimiter.value);
          tokens.push({ kind: 'redirection', redirection: { kind: 'heredoc', fd } });
          break;
        }

        default:
          refuse(`It has the redirection "${operator}".`);
      }

      continue;
    }

    tokens.push({ kind: 'word', value: readWord() });
  }

  if (pendingBodies.length > 0) {
    refuse('A here-document has no body.');
  }

  return tokens;
}

/** Parses `command` into its simple commands; anything outside the subset is refused with a reason. */
export function parseAgentShellCommand(command: string): ShellParse {
  try {
    const tokens = tokenize(command);
    const commands: ShellCommand[] = [];
    let argv: string[] = [];
    let redirections: ShellRedirection[] = [];
    const close = (next?: '&&' | ';' | '|') => {
      if (argv.length === 0) {
        refuse(redirections.length ? 'A redirection has no command.' : 'A command is empty.');
      }

      commands.push({ argv, redirections, ...(next ? { next } : {}) });
      argv = [];
      redirections = [];
    };

    for (const token of tokens) {
      if (token.kind === 'word') {
        argv.push(token.value);
      } else if (token.kind === 'redirection') {
        redirections.push(token.redirection);
      } else if (token.value === '\n') {
        // A new line ends a command; after `&&` or `|` the list continues, and a blank line is nothing.
        if (argv.length || redirections.length) {
          close(';');
        }
      } else {
        close(token.value);
      }
    }

    if (argv.length || redirections.length) {
      close();
    } else if (commands.length === 0) {
      refuse('The command is empty.');
    } else {
      // A trailing separator ends the list; a trailing `&&` or `|` waits for more input.
      const last = commands[commands.length - 1]!;
      if (last.next === '&&' || last.next === '|') {
        refuse(`It ends with "${last.next}".`);
      }

      const { next: _next, ...rest } = last;
      commands[commands.length - 1] = rest;
    }

    return { kind: 'parsed', commands };
  } catch (error) {
    if (error instanceof Refusal) {
      return { kind: 'refused', reason: error.message };
    }

    throw error;
  }
}
