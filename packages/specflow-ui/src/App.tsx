import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { defaultQueryClient } from './app/queryClient';
import { router } from './app/router';
import { LocalizationProvider } from './i18n';
import { SpecFlowServicesProvider } from './services';

export function App() {
  return (
    <QueryClientProvider client={defaultQueryClient}>
      <SpecFlowServicesProvider>
        <LocalizationProvider>
          <RouterProvider router={router} />
        </LocalizationProvider>
      </SpecFlowServicesProvider>
    </QueryClientProvider>
  );
}
