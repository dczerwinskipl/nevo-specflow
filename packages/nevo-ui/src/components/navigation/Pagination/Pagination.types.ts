export interface PaginationLabels {
  navigation: string;
  rows: string;
  rowsPerPage: string;
  previous: string;
  next: string;
  page: (pageNumber: number) => string;
  knownSummary: (start: number, end: number, total: number) => string;
  unknownSummary: (pageNumber: number) => string;
  cursorSummary: string;
}

export interface PaginationSharedProps {
  className?: string;
  labels?: Partial<PaginationLabels>;
}

export type PaginationPageVariant = 'pages' | 'simple';

export interface KnownPaginationProps extends PaginationSharedProps {
  mode: 'known';
  /** Numbered pages are the default when the total is known. */
  variant?: PaginationPageVariant;
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (pageIndex: number) => void;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  siblingCount?: number;
}

export interface UnknownPaginationProps extends PaginationSharedProps {
  mode: 'unknown';
  variant?: 'simple';
  pageIndex: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage?: boolean;
  onPageChange: (pageIndex: number) => void;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  summary?: string;
}

export interface CursorPaginationProps extends PaginationSharedProps {
  mode: 'cursor';
  variant?: 'simple';
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNext: () => void;
  onPrevious: () => void;
  summary?: string;
}

export type PaginationProps = KnownPaginationProps | UnknownPaginationProps | CursorPaginationProps;
