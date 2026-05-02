import type { AuthSession, AuthUser } from '@potato/contracts'

import { ApiError } from '@/shared/lib/api'

type AuthPayload = {
  email: string
  password: string
  confirm_password?: string
}

async function authRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = await response.text()
    }
    throw new ApiError(response.status, payload)
  }

  return (await response.json()) as T
}

export function registerRequest(payload: AuthPayload) {
  return authRequest<AuthSession>('/api/v2/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginRequest(payload: AuthPayload) {
  return authRequest<AuthSession>('/api/v2/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function refreshRequest() {
  return authRequest<AuthSession>('/api/v2/auth/refresh', {
    method: 'POST',
  })
}

export async function logoutRequest() {
  await authRequest<{ ok: boolean }>('/api/v2/auth/logout', {
    method: 'POST',
  })
}

export function meRequest(accessToken: string) {
  return authRequest<{ user: AuthUser }>('/api/v2/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}
