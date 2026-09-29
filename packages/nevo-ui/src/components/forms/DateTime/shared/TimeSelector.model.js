import { Time } from '@internationalized/date';
const minutesPerDay = 24 * 60;
export function timeToMinutes(value) {
    return value.hour * 60 + value.minute;
}
export function normalizeMinuteStep(minuteStep = 1) {
    return minuteStep;
}
export function minuteStepDelta(value, minuteStep = 1) {
    const step = normalizeMinuteStep(minuteStep);
    const minutes = timeToMinutes(value);
    const snappedMinutes = Math.round(minutes / step) * step;
    return snappedMinutes - minutes;
}
export function clampTime(value, minValue, maxValue) {
    if (minValue && timeToMinutes(value) < timeToMinutes(minValue)) {
        return minValue;
    }
    if (maxValue && timeToMinutes(value) > timeToMinutes(maxValue)) {
        return maxValue;
    }
    return value;
}
function legalTimeCandidates(minuteStep, minValue, maxValue) {
    const step = normalizeMinuteStep(minuteStep);
    const minMinutes = minValue ? timeToMinutes(minValue) : 0;
    const maxMinutes = maxValue ? timeToMinutes(maxValue) : minutesPerDay - 1;
    const candidates = [];
    for (let minuteOfDay = 0; minuteOfDay < minutesPerDay; minuteOfDay += step) {
        if (minuteOfDay < minMinutes || minuteOfDay > maxMinutes)
            continue;
        candidates.push(new Time(Math.floor(minuteOfDay / 60), minuteOfDay % 60));
    }
    return candidates;
}
export function snapTimeToMinuteStep(value, minuteStep = 1, minValue, maxValue) {
    const step = normalizeMinuteStep(minuteStep);
    if (minValue || maxValue) {
        const candidates = legalTimeCandidates(step, minValue, maxValue);
        if (candidates.length === 0) {
            return clampTime(value, minValue, maxValue);
        }
        const currentMinutes = timeToMinutes(value);
        return candidates.reduce((nearest, candidate) => {
            const candidateDistance = Math.abs(timeToMinutes(candidate) - currentMinutes);
            const nearestDistance = Math.abs(timeToMinutes(nearest) - currentMinutes);
            return candidateDistance < nearestDistance ? candidate : nearest;
        });
    }
    const snappedMinutes = (timeToMinutes(value) + minuteStepDelta(value, step) + minutesPerDay) % minutesPerDay;
    return new Time(Math.floor(snappedMinutes / 60), snappedMinutes % 60);
}
export function createHourOptions(_value, minValue, maxValue) {
    return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => {
        const hourStart = hour * 60;
        const hourEnd = hourStart + 59;
        return ((!minValue || hourEnd >= timeToMinutes(minValue)) &&
            (!maxValue || hourStart <= timeToMinutes(maxValue)));
    });
}
export function createMinuteOptions(value, minuteStep = 1, minValue, maxValue) {
    const step = normalizeMinuteStep(minuteStep);
    return Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step)
        .filter((minute) => minute < 60)
        .filter((minute) => {
        const candidate = new Time(value.hour, minute);
        return ((!minValue || timeToMinutes(candidate) >= timeToMinutes(minValue)) &&
            (!maxValue || timeToMinutes(candidate) <= timeToMinutes(maxValue)));
    });
}
export function nearestMinuteOption(value, minuteStep = 1, minValue, maxValue) {
    const options = createMinuteOptions(value, minuteStep, minValue, maxValue);
    if (options.length === 0)
        return value.minute;
    return options.reduce((nearest, candidate) => Math.abs(candidate - value.minute) < Math.abs(nearest - value.minute) ? candidate : nearest);
}
export function withHour(value, hour, minValue, maxValue) {
    return clampTime(new Time(hour, value.minute), minValue, maxValue);
}
export function withMinute(value, minute, minValue, maxValue) {
    return clampTime(new Time(value.hour, minute), minValue, maxValue);
}
export function formatHour(hour, hourCycle) {
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        hourCycle: hourCycle === 12 ? 'h12' : hourCycle === 24 ? 'h23' : undefined,
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, hour)));
}
export function formatMinute(minute) {
    return new Intl.NumberFormat(undefined, {
        minimumIntegerDigits: 2,
        useGrouping: false,
    }).format(minute);
}
//# sourceMappingURL=TimeSelector.model.js.map