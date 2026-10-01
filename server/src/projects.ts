import { randomBytes } from 'node:crypto'
import { cp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import type { Project } from '../../shared/types.ts'
import { config, models, projectDir } from './config.ts'
import { sql } from './db.ts'
import * as git from './git.ts'
import { exec, run } from './infra/exec.ts'
import * as backend from './backend.ts'
import * as sandbox from './sandbox.ts'

type Row = { id: string; ownerId: string; name: string; model: string; lastGoodCommit: string | null; instructions: string; backend: boolean; createdAt: Date; updatedAt: Date }

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const newId = () => Array.from(randomBytes(10), (b) => ID_CHARS[b % ID_CHARS.length]).join('')

export const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  model: r.model,
  lastGoodCommit: r.lastGoodCommit,
  instructions: r.instructions,
  backend: r.backend,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  previewUrl: `/p/${r.id}/`,
})

export const isModel = (m: unknown): m is string => models.some((x) => x.id === m)

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

export async function list(user: { id: string; role: string }, everyone = false): Promise<Project[]> {
  const rows = await sql<(Row & { ownerName: string })[]>`
    select p.*, u.name as owner_name from projects p join users u on u.id = p.owner_id
    where ${everyone && user.role === 'admin' ? sql`true` : sql`p.owner_id = ${user.id}`}
    order by p.updated_at desc`
  return rows.map((r) => ({ ...toProject(r), ownerName: r.ownerName, mine: r.ownerId === user.id }))
}

export async function byId(id: string): Promise<Row | undefined> {
  const [row] = await sql<Row[]>`select * from projects where id = ${id}`
  return row
}

export async function get(user: { id: string; role: string }, id: string): Promise<Row> {
  const [row] = await sql<Row[]>`select * from projects where id = ${id} and (owner_id = ${user.id} or ${user.role === 'admin'})`
  if (!row) throw new HTTPException(404, { message: 'Project not found' })
  return row
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
