import { QueryClient } from '@tanstack/react-query';

/** Living outside main.tsx so the auth store can drop the previous account's data on switch. */
export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // counters, plans and threads change from other pages — arriving at a page means reading it fresh
      refetchOnMount: 'always',
    },
  },
});
