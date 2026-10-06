import type { ArchivedSpecRecord, CurrentSpecRecord } from './model';

export interface CurrentSpecsSnapshot {
  readonly revision: string;
  readonly items: readonly CurrentSpecRecord[];
}

export interface ArchiveSpecsSnapshot {
  readonly revision: string;
  readonly items: readonly ArchivedSpecRecord[];
}

export interface SpecsOverviewRepository {
  readCurrent(): Promise<CurrentSpecsSnapshot>;
  readArchive(): Promise<ArchiveSpecsSnapshot>;
}
