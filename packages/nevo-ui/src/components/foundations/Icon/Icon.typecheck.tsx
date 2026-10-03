import { Icon } from './Icon';

<Icon name="branch" />;
<Icon aria-label="Repository branch" decorative={false} name="branch" />;

// @ts-expect-error A meaningful icon needs a contextual, human-readable name.
<Icon decorative={false} name="branch" />;
