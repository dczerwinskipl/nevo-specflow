import type { DesignValue } from '../ir/types';

export type VariantAxes = Record<string, readonly DesignValue[]>;

export type NoDesignValues = Readonly<Record<string, never>>;

export type VariantSelection<Axes extends VariantAxes> = keyof Axes extends never
  ? NoDesignValues
  : { [Axis in keyof Axes]: Axes[Axis][number] };
