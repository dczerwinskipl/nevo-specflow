import { Children, Fragment, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import { messageValues, type Message, type MessageKey } from '../../../../i18n/message';

/**
 * Inline code in supporting text (the reader's inline-code look). Long paths and keys break only
 * after a separator, so a path never overflows the panel and never breaks mid-name.
 */
export function InlineCode({ children }: { children?: ReactNode }) {
  const text = Children.toArray(children)
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join('');
  const parts = text.split(/(?<=[\\/._-])/);

  return (
    <Typography
      as="code"
      variant="code-md"
      className="rounded-control-inline border border-border-default bg-surface-control px-1 py-px text-[0.8125rem] text-content-primary"
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </Typography>
  );
}

/**
 * `Trans` for a key known only as a `MessageKey` (the policy chose it): its typed props expand the
 * union of every catalogue key, which the compiler cannot represent. The catalogue test checks the
 * keys the policy names.
 */
const MessageTrans = Trans as unknown as ComponentType<{
  i18nKey: MessageKey;
  values: Record<string, string | number>;
  components: Record<string, ReactElement>;
}>;

/** The action a step names, for example **Check again**. */
function Strong({ children }: { children?: ReactNode }) {
  return <strong className="font-medium text-content-primary">{children}</strong>;
}

/**
 * A diagnosis message as supporting text: `<code>` in the catalogue text is inline code and
 * `<strong>` the name of an action.
 */
export function DiagnosisMessage({ value }: { value: Message }) {
  const { t, i18n } = useTranslation();

  return (
    <Typography as="p" variant="body-sm" className="text-content-secondary">
      <MessageTrans
        i18nKey={value.key}
        values={messageValues(t, value, i18n.resolvedLanguage)}
        components={{ code: <InlineCode />, strong: <Strong /> }}
      />
    </Typography>
  );
}

/**
 * A command or a configuration snippet (the reader's code-block look), with the file it goes in.
 * Long lines wrap and keep their indentation (a hanging indent marks the continuation), so nothing
 * is cut off and the panel never scrolls sideways.
 */
export function CodeBlock({ children, file }: { children: string; file?: string }) {
  return (
    <div className="min-w-0 rounded-composite border border-border-default bg-canvas">
      {file && (
        <div className="border-b border-border-subtle px-3 py-1.5 font-mono text-body-sm text-content-muted">
          {file}
        </div>
      )}
      <pre className="px-3 py-2 font-mono text-[0.8125rem] leading-5 text-content-primary">
        {children.split('\n').map((line, index) => {
          const indent = line.length - line.trimStart().length;

          return (
            <span
              key={index}
              className="block whitespace-pre-wrap [overflow-wrap:anywhere]"
              style={{ paddingLeft: `${indent + 2}ch`, textIndent: '-2ch' }}
            >
              {line.trimStart()}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
