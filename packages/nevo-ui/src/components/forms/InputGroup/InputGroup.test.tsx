import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton } from '../../actions/IconButton';
import { Field } from '../Field';
import { TextInput } from '../TextInput';
import { InputGroup } from './InputGroup';

describe('InputGroup', () => {
  it('propagates Field disabled state to its control and action', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="search" disabled>
        <Field.Label>Search</Field.Label>
        <InputGroup>
          <TextInput />
          <InputGroup.Action>
            <IconButton aria-label="Clear search" icon="close" />
          </InputGroup.Action>
        </InputGroup>
      </Field>,
    );
    expect(markup).toContain('for="search"');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain(
      'border-border-subtle bg-surface-subtle text-content-muted opacity-60',
    );
    expect(markup).toContain('data-control-surface="embedded"');
    expect(markup).toContain('rounded-none border-0 bg-transparent p-0');
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain('focus-visible:bg-surface-selected');
    expect(markup).toContain('data-focus-ring="delegated"');
    expect(markup).not.toContain('role="group"');
  });

  it('supports a standalone disabled group', () => {
    const markup = renderToStaticMarkup(
      <InputGroup disabled>
        <TextInput aria-label="Search" />
        <InputGroup.Action>
          <IconButton aria-label="Clear search" icon="close" />
        </InputGroup.Action>
      </InputGroup>,
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});

