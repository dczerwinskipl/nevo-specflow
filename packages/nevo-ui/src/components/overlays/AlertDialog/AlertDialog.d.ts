import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { type HTMLAttributes } from 'react';
export declare const AlertDialog: import("react").FC<AlertDialogPrimitive.AlertDialogProps>;
export declare const AlertDialogTrigger: import("react").ForwardRefExoticComponent<AlertDialogPrimitive.AlertDialogTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const AlertDialogCancel: import("react").ForwardRefExoticComponent<AlertDialogPrimitive.AlertDialogCancelProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const AlertDialogAction: import("react").ForwardRefExoticComponent<AlertDialogPrimitive.AlertDialogActionProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const AlertDialogContent: import("react").ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogContentProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & {
    container?: HTMLElement | null;
} & import("react").RefAttributes<HTMLDivElement>>;
export declare function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): import("react/jsx-runtime").JSX.Element;
export declare const AlertDialogTitle: import("react").ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogTitleProps & import("react").RefAttributes<HTMLHeadingElement>, "ref"> & import("react").RefAttributes<HTMLHeadingElement>>;
export declare const AlertDialogDescription: import("react").ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogDescriptionProps & import("react").RefAttributes<HTMLParagraphElement>, "ref"> & import("react").RefAttributes<HTMLParagraphElement>>;
export declare function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AlertDialog.d.ts.map