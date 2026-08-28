import '@tanstack/react-start/server-only'
import { createFileRoute } from '@tanstack/react-router'

type ProxyContext = {
  request: Request
  params: { _splat?: string }
}

async function proxyRequest({ request, params }: ProxyContext) {
  const incomingUrl = new URL(request.url)
  const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001'
  const target = new URL(
    `/api/${params._splat ?? ''}${incomingUrl.search}`,
    apiOrigin,
  )
  const headers = new Headers(request.headers)
  headers.delete('connection')
  headers.delete('content-length')
  headers.delete('host')

  const response = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer(),
    redirect: 'manual',
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: proxyRequest,
      POST: proxyRequest,
      PUT: proxyRequest,
      PATCH: proxyRequest,
      DELETE: proxyRequest,
      OPTIONS: proxyRequest,
      HEAD: proxyRequest,
    },
  },
})
