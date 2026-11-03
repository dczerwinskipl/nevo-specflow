// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { CodeView } from './CodeView';

function editorOf(container: HTMLElement) {
  return EditorView.findFromDOM(container.querySelector<HTMLElement>('.cm-editor')!)!;
}

/** Highlighted tokens are spans inside a line; plain text lines hold only text. */
function tokenSpans(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('.cm-line span')];
}

describe('CodeView', () => {
  afterEach(cleanup);

  it('shows the text as a labelled textbox with a line-number gutter', () => {
    const { container } = render(
      <CodeView value={'one\ntwo\nthree'} language="plain" label="Output" />,
    );

    expect(screen.getByRole('textbox', { name: 'Output' }).textContent).toBe('onetwothree');
    const numbers = [...container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .map((element) => element.textContent)
      .filter((text) => text !== '');
    expect(numbers).toEqual(expect.arrayContaining(['1', '2', '3']));
  });

  it('shows text verbatim without a gutter when line numbers are off', () => {
    const numbered = '     1\tone\n     2\ttwo';
    const { container } = render(
      <CodeView value={numbered} language="plain" label="Output" lineNumbers={false} />,
    );

    expect(container.querySelector('.cm-gutters')).toBeNull();
    expect(editorOf(container).state.doc.toString()).toBe(numbered);
  });

  it('colours JSON keys, strings, numbers and literals as distinct tokens', () => {
    const { container } = render(
      <CodeView
        value={'{\n  "path": "src",\n  "limit": 3,\n  "all": true,\n  "next": null\n}'}
        language="json"
        label="Parameters"
      />,
    );

    const classOf = (text: string) =>
      tokenSpans(container).find((span) => span.textContent === text)?.className;
    const key = classOf('"path"');
    const string = classOf('"src"');
    const number = classOf('3');
    expect(key).toBeTruthy();
    expect(string).toBeTruthy();
    expect(number).toBeTruthy();
    expect(new Set([key, string, number]).size).toBe(3);
    // The literal constants share one hue.
    expect(classOf('true')).toBe(number);
    expect(classOf('null')).toBe(number);
  });

  it('colours Markdown, and leaves plain text uncoloured', () => {
    const markdown = render(<CodeView value="# Title" language="markdown" label="Doc" />);
    expect(tokenSpans(markdown.container).length).toBeGreaterThan(0);
    markdown.unmount();

    const plain = render(<CodeView value={'{"path": "src"}'} language="plain" label="Out" />);
    expect(tokenSpans(plain.container)).toHaveLength(0);
  });

  it('is read-only when asked: announced as such, and no keystroke reaches the text', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeView value="fixed" language="plain" label="Output" readOnly onChange={onChange} />,
    );

    expect(screen.getByRole('textbox', { name: 'Output' }).getAttribute('aria-readonly')).toBe(
      'true',
    );
    expect(editorOf(container).state.readOnly).toBe(true);
  });

  it('reports edits of an editable view, but not a new value from its owner', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <CodeView value="draft" language="markdown" label="Doc" onChange={onChange} />,
    );
    const view = editorOf(container);
    expect(view.state.readOnly).toBe(false);

    view.dispatch({ changes: { from: 5, insert: '!' } });
    expect(onChange).toHaveBeenCalledWith('draft!');

    onChange.mockClear();
    rerender(<CodeView value="replaced" language="markdown" label="Doc" onChange={onChange} />);
    expect(view.state.doc.toString()).toBe('replaced');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the caret line by default, and not for a passive viewer', () => {
    const editor = render(<CodeView value={'a\nb'} language="plain" label="Doc" />);
    expect(editor.container.querySelector('.cm-activeLine')).not.toBeNull();
    editor.unmount();

    const viewer = render(
      <CodeView value={'a\nb'} language="plain" label="Out" readOnly activeLine={false} />,
    );
    expect(viewer.container.querySelector('.cm-activeLine')).toBeNull();
    expect(viewer.container.querySelector('.cm-lineNumbers')).not.toBeNull();
  });

  it('hands the view to its owner once, and undoes the owner behaviour before destroying it', () => {
    const detach = vi.fn();
    const attach = vi.fn((_view: EditorView) => detach);
    const { unmount } = render(
      <CodeView value="x" language="plain" label="Doc" setup={() => ({ attach })} />,
    );

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]![0]).toBeInstanceOf(EditorView);
    unmount();
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
