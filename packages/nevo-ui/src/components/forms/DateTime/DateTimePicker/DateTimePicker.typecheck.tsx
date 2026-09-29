import { DateTimePicker } from './DateTimePicker';

// @ts-expect-error Seconds are not supported by the picker UI.
<DateTimePicker aria-label="Date and time" granularity="second" />;

