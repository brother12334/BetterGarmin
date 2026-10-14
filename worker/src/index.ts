/**
 * BetterGarmin cloud-sync Worker.
 *
 * Serves the GarminDB .db files that the "Sync Garmin data" GitHub Action
 * writes into an R2 bucket, gated behind a single bearer token. This is a
 * personal-use access control, not multi-user auth: anyone with the token
 * can read everything in the bucket. Keep the token private, and treat it
 * like a password.
 */

export interface Env {
  DB_BUCKET: R2Bucket
  ACCESS_TOKEN: string
  /** Origin allowed to call this Worker from a browser, e.g. https://you.github.io */
  ALLOWED_ORIGIN?: string
}

const DB_PREFIX = 'DBs/'

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  return token.length > 0 && timingSafeEqual(token, env.ACCESS_TOKEN)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    if (!env.ACCESS_TOKEN) {
      return new Response('Worker is not configured: missing ACCESS_TOKEN secret.', { status: 500, headers })
    }

    if (!isAuthorized(request, env)) {
      return new Response('Unauthorized', { status: 401, headers })
    }

    const url = new URL(request.url)

    if (url.pathname === '/manifest') {
      const listed = await env.DB_BUCKET.list({ prefix: DB_PREFIX })
      const files = listed.objects.map((obj) => ({
        name: obj.key.slice(DB_PREFIX.length),
        size: obj.size,
        lastModified: obj.uploaded.toISOString(),
      }))
      return new Response(JSON.stringify({ files }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const fileMatch = url.pathname.match(/^\/files\/([^/]+)$/)
    if (fileMatch) {
      const name = decodeURIComponent(fileMatch[1])
      if (name.includes('..') || name.includes('/')) {
        return new Response('Invalid file name', { status: 400, headers })
      }
      const object = await env.DB_BUCKET.get(DB_PREFIX + name)
      if (!object) {
        return new Response('Not found', { status: 404, headers })
      }
      return new Response(object.body, {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(object.size),
          'Last-Modified': object.uploaded.toUTCString(),
          'Cache-Control': 'no-cache',
        },
      })
    }

    return new Response('Not found', { status: 404, headers })
  },
}
