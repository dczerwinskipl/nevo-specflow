import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
  active?: boolean;
  createdAt?: Date;
}

const columns: DataTableColumn<Row>[] = [
  { id: 'id', header: 'ID', accessor: 'id' },
  { id: 'name', header: 'Name', accessor: 'name' },
];

describe('DataTable', () => {
  it('renders semantic table markup', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[{ id: '1', name: 'Acme' }]} />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toContain('Acme');
  });

  it('renders a default empty state without forcing an action', () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={[]} />);
    expect(html).toContain('No data');
    expect(html).not.toContain('Create');
  });

  it('allows the empty state to be completely replaced', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[]} emptyState={<span>Custom empty</span>} />,
    );
    expect(html).toContain('Custom empty');
    expect(html).not.toContain('No data');
  });

  it('localizes generated copy through one messages dictionary', () => {
    const localizedColumns: DataTableColumn<Row>[] = [
      { id: 'active', header: 'Active', accessor: 'active' },
    ];
    const html = renderToStaticMarkup(
      <DataTable<Row>
        columns={localizedColumns}
        data={[{ id: '1', name: 'Acme', active: true }]}
        messages={{ booleanTrue: 'Tak', booleanFalse: 'Nie' }}
      />,
    );

    expect(html).toContain('Tak');
  });

  it('makes whole-row actions focusable, named, and localization-ready', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={[{ id: '1', name: 'Acme' }]}
        messages={{ activateRow: (rowNumber) => `Otwórz wiersz ${rowNumber}` }}
        onRowClick={() => undefined}
      />,
    );

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Otwórz wiersz 1"');
  });

  it('localizes generated sorting and resizing actions', () => {
    const html = renderToStaticMarkup(
      <DataTable<Row>
        columns={[{ ...columns[0]!, sortable: true, resizable: true }]}
        data={[{ id: '1', name: 'Acme' }]}
        messages={{
          resizeColumn: (label) => `Zmień szerokość: ${label}`,
          sortBy: (label) => `Sortuj: ${label}`,
        }}
      />,
    );

    expect(html).toContain('aria-label="Sortuj: ID"');
    expect(html).toContain('aria-label="Zmień szerokość: ID"');
  });

  it('delegates domain date formatting to an explicit formatter', () => {
    const dateColumns: DataTableColumn<Row>[] = [
      { id: 'createdAt', header: 'Created', accessor: 'createdAt' },
    ];
    const html = renderToStaticMarkup(
      <DataTable
        columns={dateColumns}
        data={[{ id: '1', name: 'Acme', createdAt: new Date('2026-09-15T10:30:00Z') }]}
        valueFormatter={({ value }) =>
          value instanceof Date ? value.toISOString() : String(value)
        }
      />,
    );

    expect(html).toContain('2026-09-15T10:30:00.000Z');
  });

  it('localizes the default empty state without forcing a custom composition', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={[]}
        messages={{ emptyTitle: 'Brak danych', emptyDescription: 'Nie ma rekordów.' }}
      />,
    );

    expect(html).toContain('Brak danych');
    expect(html).toContain('Nie ma rekordów.');
  });
});

