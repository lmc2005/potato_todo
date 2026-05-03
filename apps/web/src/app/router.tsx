/* eslint-disable react-refresh/only-export-components */

import type { QueryClient } from '@tanstack/react-query'
import {
  Navigate,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import type { AuthContextValue } from '@/features/auth/auth-provider'
import { useAuth } from '@/features/auth/auth-provider'
import { AuthScreen } from '@/routes/auth-screen'
import { AppShell } from '@/shared/components/app-shell'
import { FullScreenLoader } from '@/shared/components/ui'

export type AppRouterContext = {
  auth: AuthContextValue
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRedirect,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginRoute,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'register',
  component: RegisterRoute,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'app',
  component: ProtectedLayout,
})

const workspaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'workspace',
  component: lazyRouteComponent(() => import('@/routes/workspace-page'), 'RouteComponent'),
})

const focusRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'focus',
  component: lazyRouteComponent(() => import('@/routes/focus-page'), 'RouteComponent'),
})

const agentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'agent',
  component: lazyRouteComponent(() => import('@/routes/planner-page'), 'RouteComponent'),
})

const plannerLegacyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'planner',
  component: PlannerLegacyRedirect,
})

const analyticsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'analytics',
  component: lazyRouteComponent(() => import('@/routes/analytics-page'), 'RouteComponent'),
})

const roomsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'rooms',
  component: lazyRouteComponent(() => import('@/routes/rooms-page'), 'RouteComponent'),
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: lazyRouteComponent(() => import('@/routes/settings-page'), 'RouteComponent'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([workspaceRoute, focusRoute, agentRoute, plannerLegacyRoute, analyticsRoute, roomsRoute, settingsRoute]),
])

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined as never,
    queryClient: undefined as never,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function RootLayout() {
  return <Outlet />
}

function HomeRedirect() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <FullScreenLoader message="Bootstrapping workspace" />
  }

  return <Navigate to={auth.isAuthenticated ? '/app/workspace' : '/login'} />
}

function LoginRoute() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <FullScreenLoader message="Restoring your session" />
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/app/workspace" />
  }

  return <AuthScreen mode="login" />
}

function RegisterRoute() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <FullScreenLoader message="Preparing account flow" />
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/app/workspace" />
  }

  return <AuthScreen mode="register" />
}

function ProtectedLayout() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <FullScreenLoader message="Loading your command center" />
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function PlannerLegacyRedirect() {
  return <Navigate to="/app/agent" />
}
