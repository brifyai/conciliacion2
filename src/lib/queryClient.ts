import { QueryClient } from '@tanstack/react-query'

/** Cliente de TanStack Query. Con mocks, mantiene staleTime alto para evitar refetch. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
