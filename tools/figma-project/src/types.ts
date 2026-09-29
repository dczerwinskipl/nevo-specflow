import type { ReactNode } from 'react';

export interface CaptureSection {
  component: string;
  title: string;
  description: string;
  kind: 'primitive' | 'component' | 'screen';
  order: number;
  render: () => ReactNode;
}

export interface DesignCaptureParameters extends Omit<CaptureSection, 'render'> {}

export interface DesignStoryExport {
  render?: () => ReactNode;
  parameters?: {
    designCapture?: DesignCaptureParameters;
    [key: string]: unknown;
  };
}

