import type { DesignSystemIR, ScreensIR } from '@nevo/figma-core/ir';
import type { ImportProgressUpdate } from './progress';

export type InspectionItemKind = 'component' | 'color' | 'text-style' | 'asset';

export interface IRInspectionItem {
  stableId: string;
  kind: InspectionItemKind;
  exists: boolean;
}

export interface IRInspection {
  kind: 'design-system' | 'screens';
  managedPageExists: boolean;
  items: IRInspectionItem[];
  deletions: Array<Omit<IRInspectionItem, 'exists'>>;
}

export type ImporterRequest =
  | { type: 'RESIZE_UI'; height: number }
  | { type: 'INSPECT_IR'; requestId: number; ir: DesignSystemIR | ScreensIR }
  | { type: 'IMPORT_IR'; ir: DesignSystemIR | ScreensIR };

export type ImporterResponse =
  | { type: 'INSPECTION'; requestId: number; inspection: IRInspection }
  | { type: 'INSPECTION_ERROR'; requestId: number; message: string }
  | ({ type: 'PROGRESS' } & ImportProgressUpdate)
  | { type: 'DONE' | 'ERROR'; message: string };



