type ApiAuthConfig = {
  getAccessToken: () => string | null
  refreshAccessToken: () => Promise<string | null>
  onAuthFailure: () => void
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null
  raw?: boolean
  skipAuthRefresh?: boolean
  token?: string | null
}

type ApiStreamOptions = Omit<ApiRequestOptions, 'raw'> & {
  onLine: (line: string) => Promise<void> | void
}

const authConfig: ApiAuthConfig = {
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
  onAuthFailure: () => undefined,
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, payload: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function configureApiAuth(config: Partial<ApiAuthConfig>) {
  if (config.getAccessToken) {
    authConfig.getAccessToken = config.getAccessToken
  }
  if (config.refreshAccessToken) {
    authConfig.refreshAccessToken = config.refreshAccessToken
  }
  if (config.onAuthFailure) {
    authConfig.onAuthFailure = config.onAuthFailure
  }
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

async function requestInternal<T>(path: string, options: ApiRequestOptions, canRetry: boolean): Promise<T> {
  const headers = new Headers(options.headers ?? {})
  const token = options.token ?? authConfig.getAccessToken()
  const body =
    options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob)
      ? JSON.stringify(options.body)
      : options.body ?? undefined

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  if (body && typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...options,
    body,
    credentials: 'include',
    headers,
  })

  if (response.status === 401 && canRetry && !options.skipAuthRefresh) {
    const refreshedToken = await authConfig.refreshAccessToken()
    if (refreshedToken) {
      return requestInternal<T>(path, { ...options, token: refreshedToken }, false)
    }
    authConfig.onAuthFailure()
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseResponse(response))
  }

  if (options.raw) {
    return response as T
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await parseResponse(response)) as T
}

export function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  return requestInternal<T>(path, options, true)
}

async function streamInternal(path: string, options: ApiStreamOptions, canRetry: boolean): Promise<void> {
  const headers = new Headers(options.headers ?? {})
  const token = options.token ?? authConfig.getAccessToken()
  const body =
    options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob)
      ? JSON.stringify(options.body)
      : options.body ?? undefined

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/x-ndjson, application/json')
  }

  if (body && typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...options,
    body,
    credentials: 'include',
    headers,
  })

  if (response.status === 401 && canRetry && !options.skipAuthRefresh) {
    const refreshedToken = await authConfig.refreshAccessToken()
    if (refreshedToken) {
      return streamInternal(path, { ...options, token: refreshedToken }, false)
    }
    authConfig.onAuthFailure()
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseResponse(response))
  }

  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          await options.onLine(line)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail) {
      await options.onLine(tail)
    }
  } finally {
    reader.releaseLock()
  }
}

export function apiStream(path: string, options: ApiStreamOptions) {
  return streamInternal(path, options, true)
}
