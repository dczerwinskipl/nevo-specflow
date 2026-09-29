import { TimePicker } from './TimePicker';

// @ts-expect-error Seconds are not supported by the picker UI.
<TimePicker aria-label="Time" granularity="second" />;

