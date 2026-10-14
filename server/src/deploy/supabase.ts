import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const API = 'https://api.supabase.com'

async function call<T>(token: string, method: string, route: string, body?: unknown, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 5) * 1000))
    return call(token, method, route, body, attempt + 1)
  }
  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const message = json && typeof json === 'object' && 'message' in json ? String(json.message) : `Supabase returned HTTP ${res.status}`
    throw new Error(message)
  }
  return json as T
}

export async function organizations(token: string) {
  return call<{ slug: string; name: string }[]>(token, 'GET', '/v1/organizations')
}

export async function createProject(token: string, organization: string, name: string) {
  const dbPass = randomBytes(24).toString('base64url')
  const project = await call<{ ref: string }>(token, 'POST', '/v1/projects', { name: name.slice(0, 64), organization_slug: organization, db_pass: dbPass, region_selection: { type: 'smartGroup', code: 'emea' } })
  return { ref: project.ref, dbPass }
}

/** Waits until every service answers; wakes a paused free-tier project first. */
export async function waitHealthy(token: string, ref: string) {
  const project = await call<{ status: string }>(token, 'GET', `/v1/projects/${ref}`)
  if (project.status === 'INACTIVE') await call(token, 'POST', `/v1/projects/${ref}/restore`)
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    const health = await call<{ name: string; status: string }[]>(token, 'GET', `/v1/projects/${ref}/health?services=db,auth,rest,storage`).catch(() => [])
    if (health.length === 4 && health.every((s) => s.status === 'ACTIVE_HEALTHY')) return
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error('The Supabase project did not become ready in time')
}

export async function apiKeys(token: string, ref: string) {
  const keys = await call<{ name: string; type: string; api_key: string }[]>(token, 'GET', `/v1/projects/${ref}/api-keys?reveal=true`)
  const pick = (type: string, name?: string) => keys.find((k) => k.type === type && (!name || k.name === name))?.api_key
  const publishable = pick('publishable') ?? pick('legacy', 'anon')
  const secret = pick('legacy', 'service_role') ?? pick('secret')
  if (!publishable || !secret) throw new Error('Could not read the Supabase project keys')
  return { publishable, secret }
}

export const query = (token: string, ref: string, sql: string) => call<unknown[]>(token, 'POST', `/v1/projects/${ref}/database/query`, { query: sql })

/** Applies local migration files the project has not seen yet, matched by file name, in order. */
export async function applyMigrations(token: string, ref: string, dir: string): Promise<number> {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.sql')).sort()
  const applied = new Set((await call<{ name: string }[]>(token, 'GET', `/v1/projects/${ref}/database/migrations`)).map((m) => m.name))
  let count = 0
  for (const file of files) {
    const name = file.replace(/\.sql$/, '')
    if (applied.has(name)) continue
    // Supabase stamps each migration with the current second; two in the same second collide.
    if (count) await new Promise((r) => setTimeout(r, 1100))
    try {
      await call(token, 'POST', `/v1/projects/${ref}/database/migrations`, { name, query: await readFile(path.join(dir, file), 'utf8') })
    } catch (err) {
      throw new Error(`Migration ${file} failed on Supabase: ${(err as Error).message}`)
    }
    count++
  }
  return count
}

export async function setSecrets(token: string, ref: string, secrets: { name: string; value: string }[]) {
  const allowed = secrets.filter((s) => !s.name.startsWith('SUPABASE_'))
  for (let i = 0; i < allowed.length; i += 100) await call(token, 'POST', `/v1/projects/${ref}/secrets`, allowed.slice(i, i + 100))
}

async function walk(root: string, rel: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])) {
    const child = path.posix.join(rel, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(root, child)))
    else if (entry.isFile()) out.push(child)
  }
  return out
}

/** Deploys every function in supabase/functions, each bundled with the shared helpers in _shared. */
export async function deployFunctions(token: string, ref: string, dir: string): Promise<string[]> {
  const names = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && e.name !== '_shared' && /^[\w-]+$/.test(e.name)).map((e) => e.name)
  const shared = await walk(dir, '_shared')
  for (const name of names) {
    const own = await walk(dir, name)
    const entry = own.find((f) => f === `${name}/index.ts`) ?? own.find((f) => f === `${name}/index.js`)
    if (!entry) continue
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify({ name, entrypoint_path: entry, verify_jwt: false })], { type: 'application/json' }))
    for (const file of [...own, ...shared]) form.append('file', new Blob([new Uint8Array(await readFile(path.join(dir, file)))]), file)
    try {
      await call(token, 'POST', `/v1/projects/${ref}/functions/deploy?slug=${name}`, form)
    } catch (err) {
      throw new Error(`Function ${name} failed to deploy: ${(err as Error).message}`)
    }
  }
  return names
}

export async function configureAuth(token: string, ref: string, siteUrl: string) {
  await call(token, 'PATCH', `/v1/projects/${ref}/config/auth`, { site_url: siteUrl, uri_allow_list: `${siteUrl}/**`, mailer_autoconfirm: true })
}

/** Session-mode pooler connection string (IPv4-reachable), for copying data with psql. */
export async function sessionConnection(token: string, ref: string, dbPass: string) {
  const pools = await call<{ db_host: string; db_user: string; db_name: string }[]>(token, 'GET', `/v1/projects/${ref}/config/database/pooler`)
  const pool = pools[0]
  if (!pool) throw new Error('Supabase returned no database connection details')
  return `postgresql://${encodeURIComponent(pool.db_user)}:${encodeURIComponent(dbPass)}@${pool.db_host}:5432/${pool.db_name || 'postgres'}?sslmode=require`
}

export const projectUrl = (ref: string) => `https://${ref}.supabase.co`

export function authorizeUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL(`${API}/v1/oauth/authorize`)
  url.search = new URLSearchParams({ client_id: opts.clientId, redirect_uri: opts.redirectUri, response_type: 'code', state: opts.state, code_challenge: opts.challenge, code_challenge_method: 'S256' }).toString()
  return url.href
}

export async function oauthToken(opts: { clientId: string; clientSecret: string; params: Record<string, string> }) {
  const res = await fetch(`${API}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}` },
    body: new URLSearchParams(opts.params),
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string }
  if (!res.ok || !json.access_token) throw new Error(json.message ?? `Supabase sign-in failed (HTTP ${res.status})`)
  return { token: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null }
}
