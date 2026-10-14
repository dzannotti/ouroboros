import path from 'node:path'
import type { Connection, DeployProvider, Deployment } from '../../../shared/types.ts'
import * as backend from '../backend.ts'
import { config } from '../config.ts'
import { sql } from '../db.ts'
import { publish } from '../events.ts'
import { containerExec } from '../infra/runtime.ts'
import { buildRelease, versionSource } from '../version-preview.ts'
import { open, seal } from './secret.ts'
import * as supabase from './supabase.ts'
import * as vercel from './vercel.ts'

export const isProvider = (p: string): p is DeployProvider => p === 'vercel' || p === 'supabase'

export const oauthAvailable = () => ({
  vercel: Boolean(config.deploy.vercel.clientId && config.deploy.vercel.clientSecret && config.deploy.vercel.integrationSlug),
  supabase: Boolean(config.deploy.supabase.clientId && config.deploy.supabase.clientSecret),
})

type ConnectionRow = { provider: DeployProvider; token: string; refreshToken: string | null; expiresAt: Date | null; teamId: string | null; account: string; createdAt: Date }

export async function connections(userId: string): Promise<Connection[]> {
  const rows = await sql<ConnectionRow[]>`select provider, account, created_at from connections where user_id = ${userId} order by provider`
  return rows.map((r) => ({ provider: r.provider, account: r.account, createdAt: r.createdAt.toISOString() }))
}

/** Checks a token against the provider, then stores it encrypted. Returns the account name shown in the UI. */
export async function connect(userId: string, provider: DeployProvider, grant: { token: string; refreshToken?: string | null; expiresAt?: Date | null; teamId?: string | null }) {
  let account: string
  if (provider === 'vercel') account = await vercel.account({ token: grant.token, teamId: grant.teamId })
  else {
    const [org] = await supabase.organizations(grant.token)
    if (!org) throw new Error('This Supabase account has no organization to create projects in')
    account = org.name
  }
  await sql`
    insert into connections (user_id, provider, token, refresh_token, expires_at, team_id, account)
    values (${userId}, ${provider}, ${seal(grant.token)}, ${grant.refreshToken ? seal(grant.refreshToken) : null}, ${grant.expiresAt ?? null}, ${grant.teamId ?? null}, ${account})
    on conflict (user_id, provider) do update set token = excluded.token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, team_id = excluded.team_id, account = excluded.account, created_at = now()`
  return account
}

export async function disconnect(userId: string, provider: DeployProvider) {
  await sql`delete from connections where user_id = ${userId} and provider = ${provider}`
}

async function credential(userId: string, provider: DeployProvider): Promise<{ token: string; teamId: string | null } | null> {
  const [row] = await sql<ConnectionRow[]>`select * from connections where user_id = ${userId} and provider = ${provider}`
  if (!row) return null
  const soon = row.expiresAt && row.expiresAt.getTime() < Date.now() + 120_000
  if (provider === 'supabase' && soon && row.refreshToken && oauthAvailable().supabase) {
    const fresh = await supabase.oauthToken({ ...config.deploy.supabase, params: { grant_type: 'refresh_token', refresh_token: open(row.refreshToken) } })
    await sql`update connections set token = ${seal(fresh.token)}, refresh_token = ${fresh.refreshToken ? seal(fresh.refreshToken) : row.refreshToken}, expires_at = ${fresh.expiresAt} where user_id = ${userId} and provider = ${provider}`
    return { token: fresh.token, teamId: null }
  }
  return { token: open(row.token), teamId: row.teamId }
}

type DeploymentRow = {
  projectId: string
  userId: string
  vercelProjectId: string | null
  url: string | null
  supabaseRef: string | null
  supabaseDbPass: string | null
  dataCopied: boolean
  sha: string | null
  status: Deployment['status']
  step: string | null
  error: string | null
  deployedAt: Date | null
}

const toDeployment = (r: DeploymentRow | undefined): Deployment => ({
  status: r?.status ?? 'idle',
  step: r?.step ?? null,
  error: r?.error ?? null,
  url: r?.url ?? null,
  sha: r?.sha ?? null,
  supabaseRef: r?.supabaseRef ?? null,
  deployedAt: r?.deployedAt?.toISOString() ?? null,
})

export async function deployment(projectId: string): Promise<Deployment> {
  const [row] = await sql<DeploymentRow[]>`select * from deployments where project_id = ${projectId}`
  return toDeployment(row)
}

async function save(projectId: string, fields: Partial<Omit<DeploymentRow, 'projectId' | 'userId'>>) {
  const [row] = await sql<DeploymentRow[]>`
    update deployments set ${sql(fields as Record<string, unknown>)}, updated_at = now()
    where project_id = ${projectId} returning *`
  publish(projectId, { type: 'deploy', deployment: toDeployment(row) })
  return row
}

const running = new Set<string>()

/** Publishes a version: backend to Supabase (if the project has one), then the site to Vercel. Runs in the background. */
export async function start(project: { id: string; name: string }, user: { id: string }, sha: string) {
  if (running.has(project.id)) throw new Error('A publish is already in progress')
  const hasBackend = await backend.isEnabled(project.id)
  const vercelAuth = await credential(user.id, 'vercel')
  if (!vercelAuth) throw new Error('Connect your Vercel account first')
  const supabaseAuth = hasBackend ? await credential(user.id, 'supabase') : null
  if (hasBackend && !supabaseAuth) throw new Error('This app has a backend: connect your Supabase account first')

  await sql`insert into deployments (project_id, user_id) values (${project.id}, ${user.id}) on conflict (project_id) do nothing`
  running.add(project.id)
  await save(project.id, { status: 'running', step: 'Starting', error: null })
  void run(project, sha, { token: vercelAuth.token, teamId: vercelAuth.teamId }, supabaseAuth?.token ?? null)
    .catch(async (err: unknown) => {
      console.warn(`[deploy] ${project.id} failed`, err)
      await save(project.id, { status: 'error', error: (err as Error).message, step: null })
    })
    .finally(() => running.delete(project.id))
}

async function run(project: { id: string; name: string }, sha: string, vercelAuth: vercel.VercelAuth, supabaseToken: string | null) {
  const step = (s: string) => void save(project.id, { step: s }).catch(() => {})
  const [current] = await sql<DeploymentRow[]>`select * from deployments where project_id = ${project.id}`
  const env: Record<string, string> = {}
  let live: { ref: string; secret: string } | null = null

  if (supabaseToken) {
    let ref = current.supabaseRef
    let dbPass = current.supabaseDbPass ? open(current.supabaseDbPass) : null
    if (!ref || !dbPass) {
      step('Creating the Supabase project')
      const [org] = await supabase.organizations(supabaseToken)
      if (!org) throw new Error('Your Supabase account has no organization')
      const created = await supabase.createProject(supabaseToken, org.slug, vercel.projectName(project.name, project.id))
      ;({ ref, dbPass } = created)
      await save(project.id, { supabaseRef: ref, supabaseDbPass: seal(dbPass) })
    }
    step('Waiting for the Supabase project')
    await supabase.waitHealthy(supabaseToken, ref)
    const keys = await supabase.apiKeys(supabaseToken, ref)
    const source = await versionSource(project.id, sha)

    step('Updating the database')
    await supabase.applyMigrations(supabaseToken, ref, path.join(source, 'supabase', 'migrations'))
    await backend.ensure(project.id)
    const buckets = await backend.queryJson<unknown[]>(project.id, 'select id, name, public, file_size_limit, allowed_mime_types from storage.buckets')
    if (buckets.length) {
      const json = JSON.stringify(buckets).replace(/'/g, "''")
      await supabase.query(supabaseToken, ref, `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) select id, name, public, file_size_limit, allowed_mime_types from json_populate_recordset(null::storage.buckets, '${json}') on conflict (id) do nothing`)
    }

    step('Deploying server functions')
    const secrets = await sql<{ name: string; value: string }[]>`select name, value from secrets where project_id = ${project.id}`
    await supabase.setSecrets(supabaseToken, ref, [...secrets])
    await supabase.deployFunctions(supabaseToken, ref, path.join(source, 'supabase', 'functions'))

    if (!current.dataCopied) {
      step('Copying your data')
      await copyData(project.id, await supabase.sessionConnection(supabaseToken, ref, dbPass))
      await copyFiles(project.id, ref, keys.secret)
      await save(project.id, { dataCopied: true })
    }
    env.VITE_SUPABASE_URL = supabase.projectUrl(ref)
    env.VITE_SUPABASE_ANON_KEY = keys.publishable
    live = { ref, secret: keys.secret }
  }

  step('Building the app')
  const dist = await buildRelease(project.id, sha, env)
  const published = await vercel.deployStatic(vercelAuth, { projectId: current.vercelProjectId, name: vercel.projectName(project.name, project.id), dir: dist, onStep: step })
  await save(project.id, { vercelProjectId: published.projectId, url: published.url })
  if (live && supabaseToken) {
    step('Connecting sign-in to the live site')
    await supabase.configureAuth(supabaseToken, live.ref, published.url)
  }
  await save(project.id, { status: 'ready', step: null, sha, deployedAt: new Date() })
}

/** Copies table rows and sign-in accounts (with password hashes) from the local backend into the live database, replacing seed rows. */
async function copyData(projectId: string, target: string) {
  const script = `set -e
export TARGET='${target.replace(/'/g, `'\\''`)}'
tables=$(psql -U postgres -tAc "select string_agg(format('%I.%I', schemaname, tablename), ', ') from pg_tables where schemaname = 'public'")
pg_dump -U postgres --data-only --no-owner --no-privileges -t 'public.*' -t auth.users -t auth.identities postgres > /tmp/ob-copy.sql
{ echo "begin; set session_replication_role = replica;"; [ -n "$tables" ] && echo "truncate $tables cascade;"; cat /tmp/ob-copy.sql; echo "commit;"; } | psql "$TARGET" -v ON_ERROR_STOP=1 -q -o /dev/null
rm -f /tmp/ob-copy.sql
`
  const res = await containerExec(['exec', '-i', `ob-be-${projectId}-db`, 'sh', '-s'], { input: script, timeoutMs: 10 * 60_000 })
  if (res.code !== 0) throw new Error(`Copying data failed: ${(res.stderr || res.stdout).replace(/postgresql:\/\/[^\s"']+/g, '<database>').slice(-800)}`)
}

/** Copies uploaded files from local storage buckets to the live project. */
async function copyFiles(projectId: string, ref: string, secret: string) {
  const objects = await backend.queryJson<{ bucket: string; name: string; type: string | null }[]>(projectId, "select bucket_id as bucket, name, metadata->>'mimetype' as type from storage.objects")
  const storage = backend.url(projectId, 'storage')
  const { serviceKey } = await backend.creds(projectId)
  for (const o of objects) {
    const key = `${encodeURIComponent(o.bucket)}/${o.name.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(`${storage}/object/${key}`, { headers: { authorization: `Bearer ${serviceKey}` } })
    if (!res.ok) continue
    const up = await fetch(`${supabase.projectUrl(ref)}/storage/v1/object/${key}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, apikey: secret, 'content-type': o.type ?? 'application/octet-stream', 'x-upsert': 'true' },
      body: await res.blob(),
    })
    if (!up.ok) throw new Error(`Copying file ${o.bucket}/${o.name} failed (HTTP ${up.status})`)
  }
}

export function markInterrupted() {
  return sql`update deployments set status = 'error', step = null, error = 'Interrupted by a server restart. Publish again.' where status = 'running'`
}
