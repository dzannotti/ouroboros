import { existsSync, statSync } from 'node:fs'

const ROOT = '/functions'
let registered: ((req: Request) => Response | Promise<Response>) | null = null

;(globalThis as Record<string, unknown>).Deno = {
  env: { get: (key: string) => process.env[key], toObject: () => ({ ...process.env }) },
  serve: (a: unknown, b?: unknown) => {
    registered = (typeof a === 'function' ? a : b) as typeof registered
  },
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

Bun.serve({
  port: 9000,
  hostname: '0.0.0.0',
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const name = new URL(req.url).pathname.split('/').filter(Boolean)[0]
    if (!name || !/^[\w-]+$/.test(name)) return Response.json({ error: 'Function not found' }, { status: 404, headers: cors })
    const file = ['index.ts', 'index.js'].map((f) => `${ROOT}/${name}/${f}`).find((f) => existsSync(f))
    if (!file) return Response.json({ error: `Function "${name}" not found` }, { status: 404, headers: cors })
    try {
      registered = null
      const mod = await import(`${file}?v=${statSync(file).mtimeMs}`)
      const handler = registered ?? mod.default
      if (typeof handler !== 'function') return Response.json({ error: 'Function must export a default handler or call Deno.serve()' }, { status: 500, headers: cors })
      const res: Response = await handler(req)
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(cors)) if (!headers.has(k)) headers.set(k, v)
      return new Response(res.body, { status: res.status, headers })
    } catch (err) {
      console.error(`[${name}]`, err)
      return Response.json({ error: (err as Error).message }, { status: 500, headers: cors })
    }
  },
})
console.log('functions runner listening on :9000')
