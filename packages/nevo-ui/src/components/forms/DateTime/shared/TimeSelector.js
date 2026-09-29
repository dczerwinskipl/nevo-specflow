import { jsx as _jsx } from "react/jsx-runtime";
import { Time } from '@internationalized/date';
import { TimeListSelector } from './TimeListSelector';
import { TimeWheelSelector } from './TimeWheelSelector';
export function TimeSelector(props) {
    return props.presentation === 'mobile' ? (_jsx(TimeWheelSelector, { ...props })) : (_jsx(TimeListSelector, { ...props }));
}
//# sourceMappingURL=TimeSelector.js.map