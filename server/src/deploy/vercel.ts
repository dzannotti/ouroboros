import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const API = 'https://api.vercel.com'

export type VercelAuth = { token: string; teamId?: string | null }

export class VercelError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(auth: VercelAuth, method: string, route: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const url = new URL(route, API)
  if (auth.teamId) url.searchParams.set('teamId', auth.teamId)
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${auth.token}`, ...(body !== undefined && !(body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const text = await res.text()
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } })
  if (!res.ok) throw new VercelError(json.error?.message ?? `Vercel returned HTTP ${res.status}`, res.status)
  return json
}

export async function account(auth: VercelAuth): Promise<string> {
  if (auth.teamId) {
    const team = await call<{ name?: string; slug: string }>(auth, 'GET', `/v2/teams/${auth.teamId}`)
    return team.name || team.slug
  }
  const { user } = await call<{ user: { username: string; email?: string } }>(auth, 'GET', '/v2/user')
  return user.username
}

/** Vercel project names: lowercase letters, digits and dashes, at most 100 characters. */
export const projectName = (name: string, id: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'app'}-${id.slice(0, 6)}`

async function ensureProject(auth: VercelAuth, existingId: string | null, name: string): Promise<string> {
  if (existingId) {
    try {
      return (await call<{ id: string }>(auth, 'GET', `/v9/projects/${existingId}`)).id
    } catch (err) {
      if (!(err instanceof VercelError && err.status === 404)) throw err
    }
  }
  try {
    return (await call<{ id: string }>(auth, 'POST', '/v11/projects', { name, framework: null })).id
  } catch (err) {
    if (err instanceof VercelError && err.status === 409) return (await call<{ id: string }>(auth, 'GET', `/v9/projects/${name}`)).id
    throw err
  }
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(dir, rel)))
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

const SPA_FALLBACK = JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] })

type DeploymentState = { id: string; readyState: string; aliasAssigned?: boolean; alias?: string[]; errorMessage?: string }

/** Uploads a built static site and makes it the project's production deployment. Returns the stable production URL. */
export async function deployStatic(auth: VercelAuth, opts: { projectId: string | null; name: string; dir: string; onStep: (step: string) => void }) {
  opts.onStep('Preparing the Vercel project')
  const projectId = await ensureProject(auth, opts.projectId, opts.name)

  const files = await listFiles(opts.dir)
  opts.onStep(`Uploading ${files.length} files`)
  const manifest: { file: string; sha: string; size: number }[] = []
  const queue = [...files]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const data = new Uint8Array(await readFile(path.join(opts.dir, file)))
        const sha = createHash('sha1').update(data).digest('hex')
        await call(auth, 'POST', '/v2/files', new Blob([data]), { 'content-type': 'application/octet-stream', 'x-vercel-digest': sha })
        manifest.push({ file, sha, size: data.byteLength })
      }
    }),
  )

  opts.onStep('Publishing on Vercel')
  const settings = { framework: null, buildCommand: null, installCommand: null, outputDirectory: null }
  let deployment = await call<DeploymentState>(auth, 'POST', '/v13/deployments?skipAutoDetectionConfirmation=1', {
    name: opts.name,
    project: projectId,
    target: 'production',
    files: [...manifest, { file: 'vercel.json', data: SPA_FALLBACK, encoding: 'utf-8' }],
    projectSettings: settings,
  })
  const deadline = Date.now() + 10 * 60_000
  while (!(deployment.readyState === 'READY' && deployment.aliasAssigned) && !['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.readyState)) {
    if (Date.now() > deadline) throw new Error('Vercel took too long to publish the site')
    await new Promise((r) => setTimeout(r, 2000))
    deployment = await call<DeploymentState>(auth, 'GET', `/v13/deployments/${deployment.id}`)
  }
  if (deployment.readyState !== 'READY') throw new Error(deployment.errorMessage || `Vercel deployment ${deployment.readyState.toLowerCase()}`)
  const alias = deployment.alias?.find((a) => a === `${opts.name}.vercel.app`) ?? deployment.alias?.[0]
  if (!alias) throw new Error('Vercel published the site but returned no address')
  return { projectId, url: `https://${alias}` }
}

export function authorizeUrl(slug: string, state: string) {
  return `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?state=${encodeURIComponent(state)}`
}

export async function exchangeCode(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  const res = await fetch(`${API}/v2/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri }),
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { access_token?: string; team_id?: string | null; error_description?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? `Vercel sign-in failed (HTTP ${res.status})`)
  return { token: json.access_token, teamId: json.team_id ?? null }
}
