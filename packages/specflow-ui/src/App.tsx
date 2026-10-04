import { RouterProvider } from '@tanstack/react-router';

import { router } from './app/router';
import { LocalizationProvider } from './i18n';

export function App() {
  return (
    <LocalizationProvider>
      <RouterProvider router={router} />
    </LocalizationProvider>
  );
}
