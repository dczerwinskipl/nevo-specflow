import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Badge } from '../../feedback/Badge';
import { Field } from '../Field';
import { Combobox, ComboboxGroup, ComboboxItem } from './Combobox';

const workspaces = [
  'Gdańsk',
  'Gdynia',
  'Kraków',
  'Katowice',
  'Lublin',
  'Łódź',
  'Olsztyn',
  'Opole',
  'Poznań',
  'Rzeszów',
  'Szczecin',
  'Toruń',
  'Warszawa',
  'Wrocław',
  'Zakopane',
  'Zielona Góra',
  'Żary',
  'Białystok',
];

const branches = [
  'main',
  'develop',
  'release/2026.10',
  'feature/visual-direction-v7',
  'feature/documents-explorer-with-a-very-long-descriptive-branch-name-for-truncation',
  'fix/anchor-under-floating-hamburger',
  'chore/deps',
  'hotfix/login-redirect',
  'feature/combobox',
  'feature/tree-recipes',
];

const meta = {
  title: 'Nevo UI/Forms/Combobox',
  component: Combobox,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { 'aria-label': 'Workspace', placeholder: 'Choose a workspace', children: null },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

function Many({ prefix = '' }: { prefix?: string }) {
  return workspaces.map((name) => (
    <ComboboxItem key={name} value={prefix + name}>
      {name}
    </ComboboxItem>
  ));
}

export const Default: Story = {
  render: (args) => (
    <div className="w-80">
      <Combobox {...args}>
        <Many />
      </Combobox>
    </div>
  ),
};

export const WithField: Story = {
  tags: ['visual', '!autodocs'],
  render: () => (
    <Field className="w-80">
      <Field.Label>Workspace</Field.Label>
      <Combobox defaultValue="Kraków" placeholder="Choose a workspace">
        <Many />
      </Combobox>
      <Field.Description>More than eight workspaces: type to narrow the list.</Field.Description>
    </Field>
  ),
};

export const Described: Story = {
  tags: ['visual', '!autodocs'],
  render: () => (
    <div className="w-96">
      <Combobox aria-label="Branch" defaultValue="main" placeholder="Choose a branch">
        <ComboboxGroup label="Protected">
          <ComboboxItem value="main" description="Default branch" meta={<Badge>default</Badge>}>
            main
          </ComboboxItem>
          <ComboboxItem value="develop" description="Integration branch">
            develop
          </ComboboxItem>
        </ComboboxGroup>
        <ComboboxGroup label="Work in progress">
          {branches.slice(2).map((branch) => (
            <ComboboxItem key={branch} value={branch}>
              {branch}
            </ComboboxItem>
          ))}
        </ComboboxGroup>
      </Combobox>
    </div>
  ),
};

export const Unavailable: Story = {
  tags: ['visual', '!autodocs'],
  render: () => (
    <div className="w-96">
      <Combobox aria-label="Workspace" placeholder="Choose a workspace">
        <ComboboxItem value="a">Kraków</ComboboxItem>
        <ComboboxItem
          value="b"
          unavailable
          description="Already used by another session."
          meta="busy"
        >
          Gdańsk
        </ComboboxItem>
        <ComboboxItem value="c">Poznań</ComboboxItem>
      </Combobox>
    </div>
  ),
};

export const Invalid: Story = {
  tags: ['visual', '!autodocs'],
  render: () => (
    <Field className="w-80" invalid>
      <Field.Label>Workspace</Field.Label>
      <Combobox placeholder="Choose a workspace">
        <Many />
      </Combobox>
      <Field.Error>Choose a workspace to continue.</Field.Error>
    </Field>
  ),
};

export const Disabled: Story = {
  tags: ['visual', '!autodocs'],
  render: () => (
    <div className="w-80">
      <Combobox aria-label="Workspace" disabled defaultValue="Łódź">
        <Many />
      </Combobox>
    </div>
  ),
};

function AsyncExample() {
  const [query, setQuery] = useState('');
  const [value, setValue] = useState<string | null>(null);
  const results = workspaces.filter((name) => name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="w-80">
      <Combobox
        aria-label="Repository"
        filter={false}
        inputValue={query}
        loading={query === 'wait'}
        onInputChange={setQuery}
        onValueChange={setValue}
        placeholder="Search (owner supplies the results)"
        value={value}
      >
        {query === 'wait'
          ? null
          : results.map((name) => (
              <ComboboxItem key={name} value={name}>
                {name}
              </ComboboxItem>
            ))}
      </Combobox>
    </div>
  );
}

export const Async: Story = {
  tags: ['visual', '!autodocs'],
  render: () => <AsyncExample />,
};
