import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'

import { router } from '@/app/router'
import { AuthProvider, useAuth } from '@/features/auth/auth-provider'
import { SmoothScroll } from '@/shared/components/smooth-scroll'

function RouterRuntime({ queryClient }: { queryClient: QueryClient }) {
  const auth = useAuth()

  return <RouterProvider router={router} context={{ auth, queryClient }} />
}

export function AppProviders() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScroll />
      <AuthProvider>
        <RouterRuntime queryClient={queryClient} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
