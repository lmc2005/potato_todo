interface Env {
  API_ORIGIN?: string
}

function normalizeOrigin(rawOrigin: string): URL {
  const origin = rawOrigin.trim()
  if (!origin) {
    throw new Error('Missing API_ORIGIN value.')
  }

  const normalized = origin.endsWith('/') ? origin : `${origin}/`
  return new URL(normalized)
}

function resolveTail(pathParam: string | string[] | undefined): string {
  if (Array.isArray(pathParam)) {
    return pathParam.join('/')
  }
  return pathParam ?? ''
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!context.env.API_ORIGIN) {
    return new Response('Missing API_ORIGIN environment variable.', { status: 500 })
  }

  const upstreamOrigin = normalizeOrigin(context.env.API_ORIGIN)
  const incomingUrl = new URL(context.request.url)
  const tail = resolveTail(context.params.path)
  const upstreamUrl = new URL(`api/${tail}`, upstreamOrigin)
  upstreamUrl.search = incomingUrl.search

  const headers = new Headers(context.request.headers)
  headers.delete('host')
  headers.set('x-forwarded-host', incomingUrl.host)
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  const method = context.request.method.toUpperCase()
  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : context.request.body,
    redirect: 'manual',
  })

  return fetch(upstreamRequest)
}
