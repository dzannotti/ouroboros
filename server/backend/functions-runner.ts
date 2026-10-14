import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toBunImports } from './deno-imports.ts'

const ROOT = '/functions'
const CACHE = '/tmp/functions'

const newest = (dir: string): number =>
  existsSync(dir) ? Math.max(statSync(dir).mtimeMs, ...readdirSync(dir, { withFileTypes: true }).map((e) => (e.isDirectory() ? newest(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs))) : 0

/** Copies the function (and _shared) with Deno-style imports rewritten for Bun, once per change. */
function prepare(name: string): string {
  const version = Math.floor(Math.max(newest(join(ROOT, name)), newest(join(ROOT, '_shared'))))
  const out = join(CACHE, String(version))
  if (!existsSync(join(out, name))) {
    rmSync(out, { recursive: true, force: true })
    for (const dir of [name, '_shared']) {
      if (!existsSync(join(ROOT, dir))) continue
      cpSync(join(ROOT, dir), join(out, dir), { recursive: true })
    }
    const rewrite = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) rewrite(full)
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) writeFileSync(full, toBunImports(readFileSync(full, 'utf8')))
      }
    }
    mkdirSync(out, { recursive: true })
    rewrite(out)
  }
  return join(out, name)
}

type Handler = (req: Request) => Response | Promise<Response>
let registered: Handler | null = null
const handlers = new Map<string, Handler>()

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
    const entry = ['index.ts', 'index.js'].find((f) => existsSync(`${ROOT}/${name}/${f}`))
    if (!entry) return Response.json({ error: `Function "${name}" not found` }, { status: 404, headers: cors })
    try {
      const file = join(prepare(name), entry)
      let handler = handlers.get(file)
      if (!handler) {
        registered = null
        const mod = await import(file)
        handler = registered ?? mod.default
        if (typeof handler === 'function') handlers.set(file, handler)
      }
      if (typeof handler !== 'function') return Response.json({ error: 'Function must export a default handler or call Deno.serve()' }, { status: 500, headers: cors })
      const res: Response = await (handler as Handler)(req)
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
