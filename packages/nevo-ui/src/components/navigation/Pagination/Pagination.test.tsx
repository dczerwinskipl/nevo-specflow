import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders numbered page selection when the total is known', () => {
    const html = renderToStaticMarkup(
      <Pagination
        mode="known"
        pageIndex={2}
        pageSize={10}
        totalCount={100}
        onPageChange={() => {}}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Page 3');
  });

  it('supports simple previous/next navigation for known totals', () => {
    const html = renderToStaticMarkup(
      <Pagination
        mode="known"
        variant="simple"
        pageIndex={2}
        pageSize={50}
        totalCount={1000}
        onPageChange={() => {}}
      />,
    );
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  it('does not require a total for unknown pagination', () => {
    const html = renderToStaticMarkup(
      <Pagination mode="unknown" pageIndex={2} pageSize={50} hasNextPage onPageChange={() => {}} />,
    );
    expect(html).toContain('Page 3');
  });

  it('supports cursor navigation without page numbers', () => {
    const html = renderToStaticMarkup(
      <Pagination
        mode="cursor"
        hasNextPage
        hasPreviousPage={false}
        onNext={() => {}}
        onPrevious={() => {}}
      />,
    );
    expect(html).toContain('Next');
  });

  it('allows every generated label to be localized through one dictionary', () => {
    const html = renderToStaticMarkup(
      <Pagination
        mode="known"
        pageIndex={0}
        pageSize={10}
        totalCount={20}
        pageSizeOptions={[10, 20]}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        labels={{
          navigation: 'Stronicowanie',
          rows: 'Wiersze',
          rowsPerPage: 'Wierszy na stronę',
          previous: 'Poprzednia',
          next: 'Następna',
          page: (page) => `Strona ${page}`,
          knownSummary: (start, end, total) => `${start}–${end} z ${total}`,
        }}
      />,
    );

    expect(html).toContain('aria-label="Stronicowanie"');
    expect(html).toContain('Wiersze');
    expect(html).toContain('aria-label="Wierszy na stronę"');
    expect(html).toContain('Poprzednia');
    expect(html).toContain('Następna');
    expect(html).toContain('1–10 z 20');
    expect(html).toContain('aria-label="Strona 1"');
  });
});
