// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CollectionColumns, CollectionRow, CollectionSupportingLine } from './CollectionColumns';

afterEach(cleanup);

const taskTracks = 'grid-cols-[minmax(0,40rem)_minmax(15rem,22rem)]';

describe('CollectionColumns', () => {
  it('draws one hidden-until-columns label per track, invisible to assistive technology', () => {
    const { container } = render(<CollectionColumns tracks="task" labels={['Task', 'Status']} />);
    const header = container.firstElementChild as HTMLElement;

    expect(header.getAttribute('aria-hidden')).toBe('true');
    expect([...header.children].map((cell) => cell.textContent)).toEqual(['Task', 'Status']);
    expect(header.className).toContain('hidden');
    expect(header.className).toContain('@min-[48rem]/collection:grid');
    expect(header.className).toContain(taskTracks);
  });

  it('gives the header and the rows of one preset the same tracks and column gap', () => {
    const { container } = render(
      <>
        <CollectionColumns tracks="specification" labels={['A', 'B', 'C']} />
        <CollectionRow tracks="specification">cells</CollectionRow>
      </>,
    );
    const [header, row] = [...container.children] as HTMLElement[];
    const tracks = 'grid-cols-[minmax(18rem,32rem)_minmax(15rem,22rem)_minmax(11rem,18rem)]';

    expect(header!.className).toContain(tracks);
    expect(row!.className).toContain(`@min-[48rem]/collection:${tracks}`);
    expect(header!.className).toContain('gap-x-6');
    expect(row!.className).toContain('gap-x-6');
  });

  it('stacks a row below the columns width: grid without tracks outside the query', () => {
    const { container } = render(<CollectionRow tracks="task">cells</CollectionRow>);
    const classes = (container.firstElementChild as HTMLElement).className.split(' ');

    expect(classes).toContain('grid');
    expect(classes.filter((name) => name.startsWith('grid-cols-'))).toEqual([]);
  });

  it('keeps a supporting line to two balanced, secondary lines', () => {
    const { getByText } = render(
      <CollectionSupportingLine>Waiting for the API contract review</CollectionSupportingLine>,
    );
    const line = getByText('Waiting for the API contract review');

    expect(line.tagName).toBe('P');
    expect(line.className).toContain('line-clamp-2');
    expect(line.className).toContain('[text-wrap:pretty]');
    expect(line.className).toContain('text-content-secondary');
  });
});
