import { createHmac, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config, projectDir } from './config.ts'
import { sql } from './db.ts'
import { address, cli, container, containerExec, ensureNetwork, exists, gatewayFromContainers, hostGatewayArgs, hostPath, isRunning, relabel, sharedNetwork } from './infra/runtime.ts'

const IMAGES = {
  db: process.env.BACKEND_DB_IMAGE ?? 'docker.io/supabase/postgres:17.6.1.136',
  auth: process.env.BACKEND_AUTH_IMAGE ?? 'docker.io/supabase/gotrue:v2.196.0',
  rest: process.env.BACKEND_REST_IMAGE ?? 'docker.io/postgrest/postgrest:v14.17',
  storage: process.env.BACKEND_STORAGE_IMAGE ?? 'docker.io/supabase/storage-api:v1.74.0',
  functions: process.env.BACKEND_FUNCTIONS_IMAGE ?? 'docker.io/oven/bun:1-slim',
}

const PORTS = { db: 5432, auth: 9999, rest: 3000, storage: 5000, functions: 9000 } as const
export type Service = 'auth' | 'rest' | 'storage' | 'functions'

type Creds = { jwtSecret: string; anonKey: string; serviceKey: string; dbPassword: string }
type State = { status: 'stopped' | 'starting' | 'ready' | 'error'; error?: string; urls?: Record<Service, string>; starting?: Promise<void>; lastActive: number }

const states = new Map<string, State>()
const pod = (id: string) => `ob-be-${id}`
const assets = path.join(config.root, 'server', 'backend')
const credsFile = (id: string) => path.join(config.dataDir, 'backends', id, 'creds.json')

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

export function signJwt(payload: Record<string, unknown>, secret: string) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  return `${head}.${body}.${b64url(createHmac('sha256', secret).update(`${head}.${body}`).digest())}`
}

export async function creds(id: string): Promise<Creds> {
  const file = credsFile(id)
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8')) as Creds
  const jwtSecret = randomBytes(32).toString('hex')
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 10 * 365 * 24 * 3600
  const c: Creds = {
    jwtSecret,
    anonKey: signJwt({ role: 'anon', iss: 'supabase', iat, exp }, jwtSecret),
    serviceKey: signJwt({ role: 'service_role', iss: 'supabase', iat, exp }, jwtSecret),
    dbPassword: randomBytes(18).toString('hex'),
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(c), { mode: 0o600 })
  return c
}

const state = (id: string) => {
  let s = states.get(id)
  if (!s) states.set(id, (s = { status: 'stopped', lastActive: Date.now() }))
  return s
}

export const status = (id: string) => ({ status: state(id).status, error: state(id).error })
export const url = (id: string, service: Service) => state(id).urls?.[service]

export async function isEnabled(id: string) {
  const [row] = await sql<{ backend: boolean }[]>`select backend from projects where id = ${id}`
  return Boolean(row?.backend)
}

async function secretsEnv(id: string): Promise<string[]> {
  const rows = await sql<{ name: string; value: string }[]>`select name, value from secrets where project_id = ${id}`
  return rows.flatMap((r) => ['-e', `${r.name}=${r.value}`])
}

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await check().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${what} did not become ready`)
}

const httpOk = (url: string) => async () => (await fetch(url, { signal: AbortSignal.timeout(3000) })).status < 500

async function assetsDir() {
  const dir = path.join(config.dataDir, 'backend-assets')
  await mkdir(dir, { recursive: true })
  for (const f of ['functions-runner.ts', 'roles.sql', 'jwt.sql']) await copyFile(path.join(assets, f), path.join(dir, f))
  return hostPath(dir)
}

async function startService(id: string, svc: Service | 'db', args: string[], image: string, cmd: string[] = []) {
  const name = `${pod(id)}-${svc}`
  const publish = svc === 'db' || sharedNetwork ? [] : ['-p', `127.0.0.1::${PORTS[svc]}`]
  await container(['run', '-d', '--name', name, '--label', `ouroboros.backend=${id}`, '--network', pod(id), '--network-alias', svc, ...publish, ...args, image, ...cmd])
  if (sharedNetwork && svc !== 'db') await container(['network', 'connect', sharedNetwork, name])
}

async function startFunctions(id: string, c: Creds) {
  const name = `${pod(id)}-functions`
  await containerExec(['rm', '-f', name])
  const fnDir = path.join(projectDir(id), 'supabase', 'functions')
  await mkdir(fnDir, { recursive: true })
  const dir = await assetsDir()
  await startService(
    id,
    'functions',
    [
      '--init',
      ...hostGatewayArgs(),
      '-v', `${dir}/functions-runner.ts:/runner.ts:ro,${relabel(true)}`,
      '-v', `${hostPath(fnDir)}:/functions:ro,${relabel(true)}`,
      '-e', `SUPABASE_URL=${gatewayFromContainers()}/b/${id}`,
      '-e', `SUPABASE_ANON_KEY=${c.anonKey}`,
      '-e', `SUPABASE_SERVICE_ROLE_KEY=${c.serviceKey}`,
      '-e', `SUPABASE_DB_URL=postgres://postgres:${c.dbPassword}@db:5432/postgres`,
      ...(await secretsEnv(id)),
    ],
    IMAGES.functions,
    ['bun', 'run', '/runner.ts'],
  )
}

async function provision(id: string) {
  const c = await creds(id)
  const p = pod(id)
  if (cli === 'podman' && (await containerExec(['pod', 'exists', p])).code === 0) await container(['pod', 'rm', '-f', p])
  await ensureNetwork(p, [`ouroboros.backend=${id}`])
  const dir = await assetsDir()

  const db = `${p}-db`
  if (!(await exists(db))) {
    await startService(
      id,
      'db',
      [
        '-e', `POSTGRES_PASSWORD=${c.dbPassword}`, '-e', `PGPASSWORD=${c.dbPassword}`,
        '-e', 'POSTGRES_DB=postgres', '-e', 'PGDATABASE=postgres', '-e', 'POSTGRES_HOST=/var/run/postgresql',
        '-e', 'PGPORT=5432', '-e', 'POSTGRES_PORT=5432', '-e', 'JWT_EXP=3600',
        '-v', `${dir}/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro,${relabel(true)}`,
        '-v', `${dir}/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro,${relabel(true)}`,
        '-v', `${p}-db:/var/lib/postgresql/data`,
        '-v', `${p}-dbconfig:/etc/postgresql-custom`,
      ],
      IMAGES.db,
      ['postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf', '-c', 'log_min_messages=fatal'],
    )
  } else if (!(await isRunning(db))) await container(['start', db])
  await waitFor(async () => (await containerExec(['exec', db, 'pg_isready', '-U', 'postgres', '-h', 'localhost'])).code === 0, 'Database', 120_000)
  await waitFor(async () => (await containerExec(['exec', db, 'psql', '-U', 'postgres', '-tAc', "select 1 from pg_roles where rolname='authenticator'"])).stdout.trim() === '1', 'Database roles', 60_000)

  const dbUrl = (user: string) => `postgres://${user}:${c.dbPassword}@db:5432/postgres`
  const services: [Service, string[], string][] = [
    [
      'auth',
      [
        '-e', 'GOTRUE_API_HOST=0.0.0.0', '-e', 'GOTRUE_API_PORT=9999', '-e', 'API_EXTERNAL_URL=http://localhost',
        '-e', 'GOTRUE_DB_DRIVER=postgres', '-e', `GOTRUE_DB_DATABASE_URL=${dbUrl('supabase_auth_admin')}`,
        '-e', 'GOTRUE_SITE_URL=http://localhost', '-e', 'GOTRUE_URI_ALLOW_LIST=*', '-e', 'GOTRUE_DISABLE_SIGNUP=false',
        '-e', 'GOTRUE_JWT_ADMIN_ROLES=service_role', '-e', 'GOTRUE_JWT_AUD=authenticated', '-e', 'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated',
        '-e', 'GOTRUE_JWT_EXP=3600', '-e', `GOTRUE_JWT_SECRET=${c.jwtSecret}`,
        '-e', 'GOTRUE_EXTERNAL_EMAIL_ENABLED=true', '-e', 'GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false', '-e', 'GOTRUE_MAILER_AUTOCONFIRM=true',
      ],
      IMAGES.auth,
    ],
    [
      'rest',
      [
        '-e', `PGRST_DB_URI=${dbUrl('authenticator')}`, '-e', 'PGRST_DB_SCHEMAS=public,storage,graphql_public', '-e', 'PGRST_DB_ANON_ROLE=anon',
        '-e', `PGRST_JWT_SECRET=${c.jwtSecret}`, '-e', 'PGRST_DB_USE_LEGACY_GUCS=false', '-e', 'PGRST_DB_EXTRA_SEARCH_PATH=public', '-e', 'PGRST_APP_SETTINGS_JWT_EXP=3600',
      ],
      IMAGES.rest,
    ],
    [
      'storage',
      [
        '-e', `ANON_KEY=${c.anonKey}`, '-e', `SERVICE_KEY=${c.serviceKey}`, '-e', 'POSTGREST_URL=http://rest:3000', '-e', `AUTH_JWT_SECRET=${c.jwtSecret}`,
        '-e', `DATABASE_URL=${dbUrl('supabase_storage_admin')}`, '-e', 'REQUEST_ALLOW_X_FORWARDED_PATH=true', '-e', 'FILE_SIZE_LIMIT=52428800',
        '-e', 'STORAGE_BACKEND=file', '-e', 'GLOBAL_S3_BUCKET=stub', '-e', 'FILE_STORAGE_BACKEND_PATH=/var/lib/storage', '-e', 'TENANT_ID=stub',
        '-e', 'REGION=local', '-e', 'ENABLE_IMAGE_TRANSFORMATION=false', '-v', `${p}-storage:/var/lib/storage`,
      ],
      IMAGES.storage,
    ],
  ]
  for (const [svc, args, image] of services) {
    const name = `${p}-${svc}`
    if (!(await exists(name))) await startService(id, svc, args, image)
    else if (!(await isRunning(name))) await container(['start', name])
  }
  if (!(await isRunning(`${p}-functions`))) await startFunctions(id, c)

  const urls = {} as Record<Service, string>
  for (const svc of ['auth', 'rest', 'storage', 'functions'] as const) urls[svc] = await address(`${p}-${svc}`, PORTS[svc])
  state(id).urls = urls
  await waitFor(httpOk(`${urls.auth}/health`), 'Auth service')
  await waitFor(httpOk(`${urls.rest}/`), 'Database API')
  await waitFor(httpOk(`${urls.storage}/status`), 'Storage service')
}

export function ensure(id: string): Promise<void> {
  const s = state(id)
  s.lastActive = Date.now()
  if (s.status === 'ready') return Promise.resolve()
  if (s.starting) return s.starting
  s.starting = (async () => {
    try {
      s.status = 'starting'
      await provision(id)
      s.status = 'ready'
      s.error = undefined
    } catch (err) {
      s.status = 'error'
      s.error = (err as Error).message
      throw err
    } finally {
      s.starting = undefined
    }
  })()
  return s.starting
}

export async function restartFunctions(id: string) {
  if (state(id).status !== 'ready') return
  await startFunctions(id, await creds(id))
}

export async function psql(id: string, query: string, opts: { json?: boolean; readOnly?: boolean } = {}): Promise<{ ok: boolean; output: string }> {
  await ensure(id)
  const body = opts.readOnly ? `begin read only;\n${query}\n;rollback;` : query
  const args = ['exec', '-i', `${pod(id)}-db`, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-q']
  if (opts.json) args.push('-t', '-A')
  const res = await containerExec([...args, '-f', '-'], { input: body, timeoutMs: 60_000 })
  return { ok: res.code === 0, output: (res.stdout + (res.stderr ? `\n${res.stderr}` : '')).trim() }
}

export async function queryJson<T>(id: string, query: string): Promise<T> {
  const res = await psql(id, `select coalesce(json_agg(t), '[]'::json) from (${query}) t`, { json: true })
  if (!res.ok) throw new Error(res.output)
  return JSON.parse(res.output.split('\n').find((l) => l.startsWith('[')) ?? '[]') as T
}

export async function applyMigration(id: string, name: string, query: string): Promise<{ ok: boolean; output: string; file?: string }> {
  const res = await psql(id, `begin;\n${query}\n;\ncommit;\nnotify pgrst, 'reload schema';`)
  if (!res.ok) return res
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const file = `supabase/migrations/${stamp}_${name.replace(/[^\w-]+/g, '_').slice(0, 60)}.sql`
  await mkdir(path.join(projectDir(id), 'supabase', 'migrations'), { recursive: true })
  await writeFile(path.join(projectDir(id), file), `${query.trim()}\n`)
  return { ...res, file }
}

export type TableInfo = { name: string; rls: boolean; rows: number; columns: { name: string; type: string; nullable: boolean; default: string | null }[]; policies: { name: string; command: string; roles: string[]; using: string | null; check: string | null }[] }

export async function schema(id: string): Promise<TableInfo[]> {
  return queryJson<TableInfo[]>(
    id,
    `select c.relname as name, c.relrowsecurity as rls, c.reltuples::bigint as rows,
       (select coalesce(json_agg(json_build_object('name', a.column_name, 'type', a.data_type, 'nullable', a.is_nullable = 'YES', 'default', a.column_default) order by a.ordinal_position), '[]')
          from information_schema.columns a where a.table_schema = 'public' and a.table_name = c.relname) as columns,
       (select coalesce(json_agg(json_build_object('name', p.policyname, 'command', p.cmd, 'roles', p.roles, 'using', p.qual, 'check', p.with_check)), '[]')
          from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
  )
}

export type Finding = { level: 'error' | 'warn' | 'info'; table: string; message: string }

export function scan(tables: TableInfo[]): Finding[] {
  const findings: Finding[] = []
  for (const t of tables) {
    if (!t.rls) {
      findings.push({ level: 'error', table: t.name, message: `Row level security is disabled: anyone with the public key can read and modify every row of "${t.name}".` })
      continue
    }
    if (!t.policies.length) findings.push({ level: 'info', table: t.name, message: `"${t.name}" has RLS enabled but no policies, so the app cannot read or write it.` })
    for (const p of t.policies) {
      const open = (expr: string | null) => expr === null || /^\(?true\)?$/i.test(expr.trim())
      const publicRole = p.roles.some((r) => r === 'public' || r === 'anon')
      if (p.command !== 'SELECT' && publicRole && open(p.using) && open(p.check)) {
        findings.push({ level: 'error', table: t.name, message: `Policy "${p.name}" lets anonymous users ${p.command === 'ALL' ? 'insert, update and delete' : p.command.toLowerCase()} any row of "${t.name}".` })
      } else if (p.command !== 'SELECT' && open(p.using) && open(p.check) && p.command !== 'INSERT') {
        findings.push({ level: 'warn', table: t.name, message: `Policy "${p.name}" lets any signed-in user ${p.command.toLowerCase()} every row of "${t.name}", not just their own.` })
      }
    }
  }
  return findings
}

const backendContainers = async (id: string) =>
  (await containerExec(['ps', '-aq', '--filter', `label=ouroboros.backend=${id}`])).stdout.split('\n').filter(Boolean)

export async function stop(id: string) {
  const ids = await backendContainers(id)
  if (ids.length) await containerExec(['stop', '-t', '3', ...ids])
  const s = state(id)
  s.status = 'stopped'
  s.urls = undefined
}

export async function remove(id: string) {
  const ids = await backendContainers(id)
  if (ids.length) await containerExec(['rm', '-f', ...ids])
  if (cli === 'podman') await containerExec(['pod', 'rm', '-f', pod(id)])
  await containerExec(['network', 'rm', pod(id)])
  for (const v of ['db', 'dbconfig', 'storage']) await containerExec(['volume', 'rm', '-f', `${pod(id)}-${v}`])
  states.delete(id)
}

export async function functionLogs(id: string, lines = 100) {
  const res = await containerExec(['logs', '--tail', String(lines), `${pod(id)}-functions`])
  return (res.stdout + res.stderr).trim()
}

export const touch = (id: string) => void (state(id).lastActive = Date.now())

export function startReaper(isBusy: (id: string) => boolean) {
  setInterval(() => {
    const cutoff = Date.now() - config.sandboxIdleMinutes * 60_000
    for (const [id, s] of states) if (s.status === 'ready' && s.lastActive < cutoff && !isBusy(id)) void stop(id)
  }, 60_000).unref()
}

export function clientFile(id: string, anonKey: string) {
  return `import { createClient } from '@supabase/supabase-js'

// Backend provided by Ouroboros. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to point the app at another Supabase project.
const url = import.meta.env.VITE_SUPABASE_URL ?? \`\${window.location.origin}/b/${id}\`
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '${anonKey}'

export const supabase = createClient(url, anonKey, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
})
`
}

