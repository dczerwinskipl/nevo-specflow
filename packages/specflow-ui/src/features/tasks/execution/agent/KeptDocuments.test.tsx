// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { KeptDocuments } from './KeptDocuments';

const SSO = 'specs/active/single-sign-on';

describe('KeptDocuments', () => {
  it('names the Task each kept document belongs to, once per Task', () => {
    const titles: Record<string, string> = { 't-04': 'Sign-in screen', 't-05': 'Audit log' };
    const { container } = render(
      <p>
        <KeptDocuments
          paths={[
            `${SSO}/overview.md`,
            `${SSO}/tasks/t-04/task.md`,
            `${SSO}/tasks/t-04/screens.md`,
            `${SSO}/tasks/t-05/task.md`,
          ]}
          openDocument={undefined}
          taskTitle={(id) => titles[id]}
        />
      </p>,
    );

    expect(container.textContent).toBe(
      'overview.md; Sign-in screen: task.md, screens.md; Audit log: task.md',
    );
  });

  it('keeps bare names when the Task is not known', () => {
    const { container } = render(
      <p>
        <KeptDocuments
          paths={[`${SSO}/tasks/t-04/task.md`, `${SSO}/tasks/t-04/screens.md`]}
          openDocument={undefined}
        />
      </p>,
    );

    expect(container.textContent).toBe('task.md, screens.md');
  });
});
