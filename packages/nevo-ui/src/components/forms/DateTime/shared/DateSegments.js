import { jsx as _jsx } from "react/jsx-runtime";
import { DateInput, DateSegment } from 'react-aria-components';
import { cn } from '../../../../lib';
import { dateControlClassName, dateInputClassName, dateLiteralClassName, dateSegmentClassName, } from './dateTime.styles';
export function DateSegments({ className, standalone = false, ...props }) {
    return (_jsx(DateInput, { ...props, className: cn(standalone ? dateControlClassName : dateInputClassName, className), children: (segment) => (_jsx(DateSegment, { segment: segment, className: segment.type === 'literal' ? dateLiteralClassName : dateSegmentClassName })) }));
}
//# sourceMappingURL=DateSegments.js.map