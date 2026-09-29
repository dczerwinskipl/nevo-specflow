import { Time } from '@internationalized/date';
export type MinuteStep = 1 | 5 | 10 | 15;
export declare function timeToMinutes(value: Time): number;
export declare function normalizeMinuteStep(minuteStep?: MinuteStep): MinuteStep;
export declare function minuteStepDelta(value: Time, minuteStep?: MinuteStep): number;
export declare function clampTime(value: Time, minValue?: Time | null, maxValue?: Time | null): Time;
export declare function snapTimeToMinuteStep(value: Time, minuteStep?: MinuteStep, minValue?: Time | null, maxValue?: Time | null): Time;
export declare function createHourOptions(_value: Time, minValue?: Time | null, maxValue?: Time | null): number[];
export declare function createMinuteOptions(value: Time, minuteStep?: MinuteStep, minValue?: Time | null, maxValue?: Time | null): number[];
export declare function nearestMinuteOption(value: Time, minuteStep?: MinuteStep, minValue?: Time | null, maxValue?: Time | null): number;
export declare function withHour(value: Time, hour: number, minValue?: Time | null, maxValue?: Time | null): Time;
export declare function withMinute(value: Time, minute: number, minValue?: Time | null, maxValue?: Time | null): Time;
export declare function formatHour(hour: number, hourCycle?: 12 | 24): string;
export declare function formatMinute(minute: number): string;
//# sourceMappingURL=TimeSelector.model.d.ts.map