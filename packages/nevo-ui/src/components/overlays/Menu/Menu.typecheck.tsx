import { MenuRadioGroup } from './Menu';

<MenuRadioGroup value="en" />;
<MenuRadioGroup value="en" onValueChange={() => undefined} />;

// @ts-expect-error Dropdown-menu radio groups are controlled-only; Radix does not implement defaultValue selection.
<MenuRadioGroup defaultValue="en" />;
