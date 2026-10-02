import { randomBytes } from 'node:crypto'
import { cp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import type { Access, Project, ShareAccess, Sharing } from '../../shared/types.ts'
import { config, models, projectDir } from './config.ts'
import { sql } from './db.ts'
import * as git from './git.ts'
import { exec, run } from './infra/exec.ts'
import * as backend from './backend.ts'
import * as sandbox from './sandbox.ts'

type Row = { id: string; ownerId: string; name: string; model: string; lastGoodCommit: string | null; instructions: string; backend: boolean; everyoneAccess: ShareAccess | null; createdAt: Date; updatedAt: Date }
type Viewer = { id: string; role: string }

const RANK: Record<Access, number> = { view: 0, edit: 1, owner: 2 }

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const newId = () => Array.from(randomBytes(10), (b) => ID_CHARS[b % ID_CHARS.length]).join('')

export const isModel = (m: unknown): m is string => models.some((x) => x.id === m)

/** A project keeps the model it was last used with; if that model has since been retired, it moves to the default. */
export const liveModel = (m: string) => (isModel(m) ? m : config.ai.defaultModel)

export const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  model: liveModel(r.model),
  lastGoodCommit: r.lastGoodCommit,
  instructions: r.instructions,
  backend: r.backend,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  previewUrl: `/p/${r.id}/`,
})

export async function create(ownerId: string, name: string, model: string): Promise<Project> {
  const id = newId()
  const dir = projectDir(id)
  await cp(config.templateDir, dir, { recursive: true, filter: (src) => !/[/\\](node_modules|\.pnpm-store|dist)$/.test(src) })
  await git.init(dir)
  await git.commitAll(dir, 'Initial version')
  const [row] = await sql<Row[]>`
    insert into projects (id, owner_id, name, model) values (${id}, ${ownerId}, ${name}, ${isModel(model) ? model : config.ai.defaultModel})
    returning *`
  return toProject(row)
}

export async function remix(ownerId: string, source: Row): Promise<Project> {
  const id = newId()
  const dir = projectDir(id)
  await run('git', ['clone', '-q', '--no-hardlinks', projectDir(source.id), dir])
  await run('git', ['remote', 'remove', 'origin'], { cwd: dir })
  await git.commitAll(dir, `Remixed from ${source.name}`)
  const [row] = await sql<Row[]>`
    insert into projects (id, owner_id, name, model, instructions, last_good_commit)
    values (${id}, ${ownerId}, ${`${source.name} (remix)`.slice(0, 60)}, ${source.model}, ${source.instructions}, ${await git.head(dir)})
    returning *`
  return toProject(row)
}

const accessOf = (user: Viewer) => sql`
  case
    when p.owner_id = ${user.id} or ${user.role === 'admin'} then 'owner'
    when m.access = 'edit' or p.everyone_access = 'edit' then 'edit'
    when m.access = 'view' or p.everyone_access = 'view' then 'view'
  end`

export async function list(user: Viewer, everyone = false): Promise<Project[]> {
  const rows = await sql<(Row & { ownerName: string; access: Access })[]>`
    select p.*, u.name as owner_name, ${accessOf(user)} as access
    from projects p
    join users u on u.id = p.owner_id
    left join project_members m on m.project_id = p.id and m.user_id = ${user.id}
    where ${everyone && user.role === 'admin' ? sql`true` : sql`(p.owner_id = ${user.id} or m.access is not null or p.everyone_access is not null)`}
    order by p.updated_at desc`
  return rows.map((r) => ({ ...toProject(r), ownerName: r.ownerName, mine: r.ownerId === user.id, access: r.access }))
}

export async function byId(id: string): Promise<Row | undefined> {
  const [row] = await sql<Row[]>`select * from projects where id = ${id}`
  return row
}

export async function get(user: Viewer, id: string, need: Access = 'view'): Promise<Row & { access: Access; ownerName: string }> {
  const [row] = await sql<(Row & { access: Access | null; ownerName: string })[]>`
    select p.*, ${accessOf(user)} as access, (select name from users where id = p.owner_id) as owner_name
    from projects p left join project_members m on m.project_id = p.id and m.user_id = ${user.id}
    where p.id = ${id}`
  if (!row?.access) throw new HTTPException(404, { message: 'Project not found' })
  if (RANK[row.access] < RANK[need]) throw new HTTPException(403, { message: need === 'owner' ? 'Only the owner can do that' : 'You can view this project but not change it' })
  return { ...row, access: row.access }
}

const isShareAccess = (a: unknown): a is ShareAccess => a === 'view' || a === 'edit'

export async function sharing(row: Row): Promise<Sharing> {
  const members = await sql<{ userId: string; access: ShareAccess }[]>`select user_id, access from project_members where project_id = ${row.id}`
  const people = await sql<Sharing['people']>`select id, name, email from users where id <> ${row.ownerId} order by name`
  return { everyone: row.everyoneAccess, members: [...members], people: [...people] }
}

export async function setSharing(row: Row, input: { everyone?: unknown; members?: unknown }): Promise<Sharing> {
  const people = new Set((await sql<{ id: string }[]>`select id from users where id <> ${row.ownerId}`).map((u) => u.id))
  const wanted = new Map<string, ShareAccess>()
  for (const m of Array.isArray(input.members) ? (input.members as { userId?: unknown; access?: unknown }[]) : []) {
    if (typeof m?.userId === 'string' && people.has(m.userId) && isShareAccess(m.access)) wanted.set(m.userId, m.access)
  }
  const everyone = isShareAccess(input.everyone) ? input.everyone : null
  await sql.begin(async (tx) => {
    await tx`update projects set everyone_access = ${everyone} where id = ${row.id}`
    await tx`delete from project_members where project_id = ${row.id}`
    for (const [userId, access] of wanted) await tx`insert into project_members (project_id, user_id, access) values (${row.id}, ${userId}, ${access})`
  })
  return sharing({ ...row, everyoneAccess: everyone })
}

export async function update(id: string, fields: { name?: string; model?: string; lastGoodCommit?: string | null; instructions?: string }): Promise<Project> {
  const [row] = await sql<Row[]>`
    update projects set
      name = coalesce(${fields.name ?? null}, name),
      model = coalesce(${fields.model ?? null}, model),
      instructions = coalesce(${fields.instructions ?? null}, instructions),
      last_good_commit = ${fields.lastGoodCommit === undefined ? sql`last_good_commit` : fields.lastGoodCommit},
      updated_at = now()
    where id = ${id} returning *`
  return toProject(row)
}

export async function remove(id: string) {
  await sandbox.remove(id)
  await backend.remove(id)
  await sql`delete from projects where id = ${id}`
  await rm(projectDir(id), { recursive: true, force: true })
}

export async function files(id: string): Promise<string[]> {
  const res = await exec('git', ['ls-files', '-co', '--exclude-standard'], { cwd: projectDir(id) })
  return res.stdout.split('\n').filter((f) => f && !f.startsWith('.ouroboros-versions/')).sort()
}

export function safePath(id: string, file: string): string {
  const root = projectDir(id)
  const full = path.resolve(root, file.replace(/^\/+/, ''))
  if (full !== root && !full.startsWith(root + path.sep)) throw new HTTPException(400, { message: 'Invalid path' })
  if (/(^|[/\\])(\.git|node_modules)([/\\]|$)/.test(path.relative(root, full))) throw new HTTPException(400, { message: 'Invalid path' })
  return full
}

export async function readFileText(id: string, file: string): Promise<string> {
  return readFile(safePath(id, file), 'utf8')
}
