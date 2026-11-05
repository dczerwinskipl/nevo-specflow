import { describe, expect, it } from 'vitest';
import { BREADCRUMBS_COLLAPSE_BELOW, collapseBreadcrumbs } from './breadcrumbsLayout';

const narrow = BREADCRUMBS_COLLAPSE_BELOW - 1;
const wide = BREADCRUMBS_COLLAPSE_BELOW;

describe('collapseBreadcrumbs', () => {
  it('never collapses one or two segments', () => {
    expect(collapseBreadcrumbs(1, 100)).toEqual({ visible: [0], hidden: [] });
    expect(collapseBreadcrumbs(2, 100)).toEqual({ visible: [0, 1], hidden: [] });
  });

  it('folds every middle segment when narrow: Root › … › Current', () => {
    expect(collapseBreadcrumbs(3, narrow)).toEqual({ visible: [0, 2], hidden: [1] });
    expect(collapseBreadcrumbs(5, narrow)).toEqual({ visible: [0, 4], hidden: [1, 2, 3] });
  });

  it('shows at most four segments when wide, folding the oldest middle ones first', () => {
    expect(collapseBreadcrumbs(3, wide)).toEqual({ visible: [0, 1, 2], hidden: [] });
    expect(collapseBreadcrumbs(4, wide)).toEqual({ visible: [0, 1, 2, 3], hidden: [] });
    expect(collapseBreadcrumbs(6, wide)).toEqual({ visible: [0, 3, 4, 5], hidden: [1, 2] });
  });

  it('treats an unmeasured width as wide and honours a custom threshold', () => {
    expect(collapseBreadcrumbs(3, undefined).hidden).toEqual([]);
    expect(collapseBreadcrumbs(3, 300, 320).hidden).toEqual([1]);
    expect(collapseBreadcrumbs(3, 330, 320).hidden).toEqual([]);
  });
});
