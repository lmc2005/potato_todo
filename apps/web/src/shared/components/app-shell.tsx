import type { ReactNode } from 'react'

import { Link, useRouterState } from '@tanstack/react-router'

import { useAuth } from '@/features/auth/auth-provider'
import { Button } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

const navigation = [
  { to: '/app/workspace', label: 'Workspace' },
  { to: '/app/focus', label: 'Focus' },
  { to: '/app/agent', label: 'Agent' },
  { to: '/app/analytics', label: 'Analytics' },
  { to: '/app/rooms', label: 'Rooms' },
  { to: '/app/settings', label: 'Settings' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <div className="min-h-screen">
      <header
        className={cn(
          'sticky top-0 z-30 w-full py-5 backdrop-blur-[18px]',
          pathname === '/app/workspace'
            ? 'app-header-workspace border-b border-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0.72)_54%,rgba(255,255,255,0.18)_100%)]'
            : 'border-b border-black/5 bg-[rgba(255,255,255,0.88)]',
        )}
      >
        <div className="shell-inner grid gap-4 xl:grid-cols-[158px_minmax(0,1fr)_auto] xl:items-center">
          <div className="flex items-center gap-3">
            <p className="nav-wordmark">Potato Todo</p>
          </div>

          <nav className="flex flex-wrap gap-6 xl:justify-center">
            {navigation.map((item) => {
              const active = pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'repay-link py-2',
                    active && 'repay-link-active',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="primary"
              size="sm"
              className="header-signout-btn min-w-[104px]"
              onClick={() => {
                void auth.logout()
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'page-shell flex min-w-0 flex-col gap-10 pb-12',
          pathname === '/app/workspace' ? 'mt-0' : 'mt-4',
        )}
      >
        {children}
      </main>
    </div>
  )
}
