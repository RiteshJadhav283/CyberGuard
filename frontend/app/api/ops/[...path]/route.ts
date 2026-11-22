import { NextRequest, NextResponse } from 'next/server'

const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:8000'
const SERVER_TOKEN = process.env.AEGIS_ORGANIZER_TOKEN || 'medicore-judge-session-token-v1'

// Allowlist of permitted ops routes
function isAllowed(pathSegments: string[]): boolean {
  if (pathSegments.length === 0) return false
  const [root, ...rest] = pathSegments

  if (root === 'overview') return true
  if (root === 'connections') return true
  if (root === 'cases') return true
  if (root === 'exercises' && rest[0] === 'comparison') return true
  if (root === 'auth' && rest[0] === 'me') return true

  return false
}

// Loopback & Same-Origin validation
function validateOrigin(req: NextRequest, isStateChanging: boolean): { ok: boolean; reason?: string } {
  const host = req.headers.get('host') || ''
  const isLoopback = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('[::1]')

  if (!isLoopback) {
    return { ok: false, reason: 'Console judge mode requires loopback access' }
  }

  if (isStateChanging) {
    const origin = req.headers.get('origin')
    const referer = req.headers.get('referer')
    const secFetchSite = req.headers.get('sec-fetch-site')

    if (secFetchSite === 'cross-site') {
      return { ok: false, reason: 'Cross-origin request rejected' }
    }

    if (origin) {
      try {
        const originUrl = new URL(origin)
        if (!originUrl.host.includes('localhost') && !originUrl.host.includes('127.0.0.1')) {
          return { ok: false, reason: 'Invalid state-changing origin' }
        }
      } catch {
        return { ok: false, reason: 'Malformed origin header' }
      }
    } else if (referer) {
      try {
        const refUrl = new URL(referer)
        if (!refUrl.host.includes('localhost') && !refUrl.host.includes('127.0.0.1')) {
          return { ok: false, reason: 'Invalid state-changing referer' }
        }
      } catch {
        return { ok: false, reason: 'Malformed referer header' }
      }
    }
  }

  return { ok: true }
}

async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const resolvedParams = 'then' in context.params ? await context.params : context.params
  const path = resolvedParams.path || []
  console.log('[OPS PROXY]', req.method, path, req.url)
  const method = req.method
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)

  const validation = validateOrigin(req, isStateChanging)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 403 })
  }

  if (!isAllowed(path)) {
    return NextResponse.json({ error: 'Route not permitted by Aegis Ops security allowlist' }, { status: 403 })
  }

  const query = req.nextUrl.search
  const targetUrl = `${API_ORIGIN}/api/v1/ops/${path.join('/')}${query}`

  let body: BodyInit | null = null
  if (isStateChanging) {
    const text = await req.text()
    if (text) {
      body = text
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method,
      headers: {
        'Content-Type': req.headers.get('content-type') || 'application/json',
        'Authorization': `Bearer ${SERVER_TOKEN}`,
        'Accept': req.headers.get('accept') || '*/*'
      },
      body,
      cache: 'no-store'
    })

    const contentType = upstreamRes.headers.get('content-type') || ''
    const contentDisposition = upstreamRes.headers.get('content-disposition')

    const responseHeaders = new Headers()
    if (contentType) responseHeaders.set('content-type', contentType)
    if (contentDisposition) responseHeaders.set('content-disposition', contentDisposition)

    if (contentType.includes('application/json')) {
      const data = await upstreamRes.json().catch(() => ({}))
      return NextResponse.json(data, {
        status: upstreamRes.status,
        headers: responseHeaders
      })
    }

    // Binary / File stream (e.g. recovered report)
    const arrayBuffer = await upstreamRes.arrayBuffer()
    return new NextResponse(arrayBuffer, {
      status: upstreamRes.status,
      headers: responseHeaders
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Aegis backend unreachable',
        detail: err instanceof Error ? err.message : 'Connection failed to local Aegis service'
      },
      { status: 503 }
    )
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
