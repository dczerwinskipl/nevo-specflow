import * as Dialog from '@radix-ui/react-dialog';
import { type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import './Drawer.css';
export declare const Drawer: import("react").FC<Dialog.DialogProps>;
export declare const DrawerTrigger: import("react").ForwardRefExoticComponent<Dialog.DialogTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const DrawerClose: import("react").ForwardRefExoticComponent<Dialog.DialogCloseProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const DrawerOverlay: import("react").ForwardRefExoticComponent<Omit<Dialog.DialogOverlayProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
type DrawerCloseActionProps = {
    showClose?: true;
    closeLabel: string;
} | {
    showClose: false;
    closeLabel?: never;
};
export type DrawerContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
    container?: HTMLElement | null;
    overlayClassName?: string;
    side?: 'left' | 'right';
} & DrawerCloseActionProps;
export declare const DrawerContent: import("react").ForwardRefExoticComponent<DrawerContentProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const DrawerHeader: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & import("react").RefAttributes<HTMLDivElement>>;
export declare const DrawerTitle: import("react").ForwardRefExoticComponent<Omit<Dialog.DialogTitleProps & import("react").RefAttributes<HTMLHeadingElement>, "ref"> & import("react").RefAttributes<HTMLHeadingElement>>;
export declare const DrawerDescription: import("react").ForwardRefExoticComponent<Omit<Dialog.DialogDescriptionProps & import("react").RefAttributes<HTMLParagraphElement>, "ref"> & import("react").RefAttributes<HTMLParagraphElement>>;
export declare const DrawerBody: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & import("react").RefAttributes<HTMLDivElement>>;
export declare const DrawerFooter: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & import("react").RefAttributes<HTMLDivElement>>;
export {};
//# sourceMappingURL=Drawer.d.ts.map