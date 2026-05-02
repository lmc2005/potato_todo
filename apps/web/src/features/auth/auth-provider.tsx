/* eslint-disable react-refresh/only-export-components */

import type { AuthUser } from '@potato/contracts'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { loginRequest, logoutRequest, meRequest, refreshRequest, registerRequest } from '@/features/auth/api'
import { configureApiAuth } from '@/shared/lib/api'

type SessionPayload = {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  status: AuthStatus
  user: AuthUser | null
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: { email: string; password: string; confirm_password: string }) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function adoptSession(session: SessionPayload, setUser: (user: AuthUser | null) => void, setToken: (token: string | null) => void, setStatus: (status: AuthStatus) => void) {
  setToken(session.access_token)
  setUser(session.user)
  setStatus('authenticated')
  return session.access_token
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const refreshAccessToken = useCallback(async () => {
    try {
      const session = await refreshRequest()
      return adoptSession(session, setUser, setAccessToken, setStatus)
    } catch {
      clearSession()
      return null
    }
  }, [clearSession])

  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => accessToken,
      onAuthFailure: clearSession,
      refreshAccessToken,
    })
  }, [accessToken, clearSession, refreshAccessToken])

  useEffect(() => {
    let disposed = false

    async function bootstrap() {
      try {
        const session = await refreshRequest()
        const profile = await meRequest(session.access_token)
        if (disposed) {
          return
        }
        setAccessToken(session.access_token)
        setUser(profile.user)
        setStatus('authenticated')
      } catch {
        if (!disposed) {
          clearSession()
        }
      }
    }

    bootstrap()

    return () => {
      disposed = true
    }
  }, [clearSession, refreshAccessToken])

  const value: AuthContextValue = {
    accessToken,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'bootstrapping',
    status,
    user,
    async login(payload) {
      const session = await loginRequest(payload)
      adoptSession(session, setUser, setAccessToken, setStatus)
    },
    async register(payload) {
      const session = await registerRequest(payload)
      adoptSession(session, setUser, setAccessToken, setStatus)
    },
    async logout() {
      try {
        await logoutRequest()
      } finally {
        clearSession()
      }
    },
    refreshAccessToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
