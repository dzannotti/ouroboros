import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import type { StyleChanges } from '../../shared/styles.ts'
import type { Access, ChatMode, Part, ProjectEvent, SelectedElement, Version } from '../../shared/types.ts'
import * as agent from './agent/run.ts'
import { type User, auth } from './auth.ts'
import { config, models, projectDir } from './config.ts'
import { publish, subscribe } from './events.ts'
import * as git from './git.ts'
import * as messages from './messages.ts'
import * as projects from './projects.ts'
import * as sandbox from './sandbox.ts'
import { available as browserAvailable, capture, saveThumbnail, thumbnailPath } from './browser.ts'
import * as approvals from './approvals.ts'
import * as backend from './backend.ts'
import { sql } from './db.ts'
import { buildVersion } from './version-preview.ts'
import { inspect, type TextSegment, visualEdit } from './visual-edit.ts'

type Env = { Variables: { user: User } }

const api = new Hono<Env>()
api.use('*', auth)

const RAW_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', svg: 'image/svg+xml' }
const MAX_UPLOAD = 10 * 1024 * 1024
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' })
  }
}

const mode = (m: unknown): ChatMode => (m === 'plan' ? 'plan' : 'build')

function userParts(input: { text?: string; images?: { url: string; name: string }[]; elements?: SelectedElement[] }): Part[] {
  const parts: Part[] = []
  if (input.text?.trim()) parts.push({ type: 'text', text: input.text.trim() })
  for (const img of input.images ?? []) if (typeof img?.url === 'string') parts.push({ type: 'image', url: img.url, name: String(img.name ?? 'image') })
  const elements = (input.elements ?? [])
    .filter((e) => typeof e?.oid === 'string')
    .slice(0, 10)
    .map((e) => ({ oid: e.oid, tag: String(e.tag ?? ''), text: String(e.text ?? '').slice(0, 300), className: String(e.className ?? '').slice(0, 500), note: typeof e.note === 'string' ? e.note.slice(0, 500) : undefined }))
  if (elements.length) parts.push({ type: 'elements', elements })
  if (!parts.length) throw new HTTPException(400, { message: 'Message is empty' })
  return parts
}

async function send(projectId: string, author: User, input: { text?: string; images?: { url: string; name: string }[]; elements?: SelectedElement[]; mode?: unknown; model?: unknown }) {
  if (agent.isRunning(projectId)) throw new HTTPException(409, { message: 'Ouroboros is still working on the previous message' })
  const row = await projects.update(projectId, projects.isModel(input.model) ? { model: input.model } : {})
  await answerOpenQuestions(projectId)
  const user = await messages.create(projectId, 'user', userParts(input), { mode: mode(input.mode), author })
  publish(projectId, { type: 'message', message: messages.toMessage(user) })
  await agent.startRun({ projectId, userMessageId: user.id, mode: mode(input.mode), model: row.model })
  return user
}

async function answerOpenQuestions(projectId: string) {
  const rows = await messages.list(projectId)
  const last = rows.at(-1)
  if (!last || last.role !== 'assistant') return
  const idx = last.parts.findIndex((p) => p.type === 'question' && !p.answered)
  if (idx === -1) return
  const parts = last.parts.map((p, i) => (i === idx && p.type === 'question' ? { ...p, answered: true } : p))
  await messages.save(last.id, { parts })
  publish(projectId, { type: 'part', messageId: last.id, index: idx, part: parts[idx] })
}

api.get('/me', (c) => c.json({ ...c.get('user'), authMode: config.auth.mode }))

api.get('/config', (c) => c.json({ models, previewPort: config.previewPort, previewUrl: config.previewUrl ?? null }))

api.get('/projects', async (c) => c.json(await projects.list(c.get('user'), c.req.query('scope') === 'all')))

api.post('/projects', async (c) => {
  const input = await body<{ text?: string; model?: string; mode?: string; draft?: boolean }>(c)
  if (!input.text?.trim()) throw new HTTPException(400, { message: 'Describe what you want to build' })
  const name = input.text.trim().split(/\s+/).slice(0, 5).join(' ').slice(0, 40)
  const project = await projects.create(c.get('user').id, name, input.model ?? config.ai.defaultModel)
  void sandbox.ensure(project.id).catch(() => {})
  if (!input.draft) await send(project.id, c.get('user'), { text: input.text, mode: input.mode, model: project.model })
  return c.json(project, 201)
})

/** Loads the project if the caller may use it: reading needs view access, changing needs edit, unless `need` says otherwise. */
const owned = async (c: { req: { param: (k: string) => string; method: string }; get: (k: 'user') => User }, need?: Access) =>
  projects.get(c.get('user'), c.req.param('id'), need ?? (c.req.method === 'GET' ? 'view' : 'edit'))

api.get('/projects/:id', async (c) => {
  const row = await owned(c)
  void sandbox.ensure(row.id).catch(() => {})
  return c.json({ ...projects.toProject(row), access: row.access, ownerName: row.ownerName, mine: row.ownerId === c.get('user').id, sandbox: sandbox.status(row.id), running: agent.runningMessage(row.id) ?? null })
})

api.patch('/projects/:id', async (c) => {
  await owned(c, 'owner')
  const input = await body<{ name?: string; model?: string; instructions?: string }>(c)
  const project = await projects.update(c.req.param('id'), {
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 60) : undefined,
    model: projects.isModel(input.model) ? input.model : undefined,
    instructions: typeof input.instructions === 'string' ? input.instructions.slice(0, 8000) : undefined,
  })
  publish(project.id, { type: 'project', project })
  return c.json(project)
})

api.get('/projects/:id/sharing', async (c) => c.json(await projects.sharing(await owned(c, 'owner'))))

api.put('/projects/:id/sharing', async (c) => c.json(await projects.setSharing(await owned(c, 'owner'), await body(c))))

api.post('/projects/:id/remix', async (c) => {
  const row = await owned(c, 'view')
  return c.json(await projects.remix(c.get('user').id, row), 201)
})

api.delete('/projects/:id', async (c) => {
  await owned(c, 'owner')
  agent.stop(c.req.param('id'))
  await projects.remove(c.req.param('id'))
  return c.body(null, 204)
})

api.get('/projects/:id/messages', async (c) => {
  await owned(c)
  return c.json((await messages.list(c.req.param('id'))).map(messages.toMessage))
})

api.post('/projects/:id/messages', async (c) => {
  await owned(c)
  const user = await send(c.req.param('id'), c.get('user'), await body(c))
  return c.json(messages.toMessage(user), 201)
})

api.post('/projects/:id/stop', async (c) => {
  await owned(c)
  agent.stop(c.req.param('id'))
  return c.body(null, 204)
})

api.get('/projects/:id/events', async (c) => {
  await owned(c)
  const id = c.req.param('id')
  return streamSSE(c, async (stream) => {
    const queue: string[] = []
    let wake: (() => void) | undefined
    const unsubscribe = subscribe(id, (event) => {
      queue.push(JSON.stringify(event))
      wake?.()
    })
    stream.onAbort(() => {
      unsubscribe()
      wake?.()
    })
    queue.push(JSON.stringify({ type: 'sandbox', ...sandbox.status(id) } satisfies ProjectEvent))
    while (!stream.aborted) {
      while (queue.length) await stream.writeSSE({ data: queue.shift()! })
      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, 15_000)
      })
      wake = undefined
      if (!queue.length) await stream.writeSSE({ event: 'ping', data: '' })
    }
    unsubscribe()
  })
})

api.get('/projects/:id/files', async (c) => {
  await owned(c)
  return c.json(await projects.files(c.req.param('id')))
})

api.get('/projects/:id/file', async (c) => {
  await owned(c)
  const file = c.req.query('path')
  if (!file) throw new HTTPException(400, { message: 'path required' })
  const sha = c.req.query('sha')
  if (sha) {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new HTTPException(400, { message: 'bad sha' })
    projects.safePath(c.req.param('id'), file)
    return c.text(await git.show(projectDir(c.req.param('id')), sha, file))
  }
  try {
    const type = c.req.query('raw') ? RAW_TYPES[path.extname(file).slice(1).toLowerCase()] : undefined
    if (type) {
      const bytes = await readFile(projects.safePath(c.req.param('id'), file))
      return c.body(new Uint8Array(bytes), 200, { 'content-type': type, 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'cache-control': 'private, no-cache' })
    }
    return c.text(await projects.readFileText(c.req.param('id'), file))
  } catch (err) {
    if (err instanceof HTTPException) throw err
    throw new HTTPException(404, { message: 'File not found' })
  }
})

api.put('/projects/:id/file', async (c) => {
  const row = await owned(c)
  if (agent.isRunning(row.id)) throw new HTTPException(409, { message: 'Wait for the current response to finish' })
  const file = c.req.query('path')
  if (!file || /^(\.ouroboros|pnpm-lock\.yaml|\.ouroboros-versions)/.test(file)) throw new HTTPException(400, { message: 'This file cannot be edited' })
  const full = projects.safePath(row.id, file)
  const { content } = await body<{ content?: string }>(c)
  if (typeof content !== 'string') throw new HTTPException(400, { message: 'content required' })
  await writeFile(full, content)
  publish(row.id, { type: 'files', paths: [file] })
  const sha = await git.commitAll(projectDir(row.id), `Edited ${file} by hand`)
  if (sha) publish(row.id, { type: 'versions' })
  return c.json({ sha })
})

api.get('/projects/:id/versions', async (c) => {
  const row = await owned(c)
  const dir = projectDir(row.id)
  const log = await git.log(dir)
  const head = log[0]?.sha
  const versions: Version[] = log.map((v) => ({ ...v, good: v.sha === row.lastGoodCommit, current: v.sha === head }))
  return c.json(versions)
})

api.get('/projects/:id/versions/:sha/diff', async (c) => {
  await owned(c)
  const sha = c.req.param('sha')
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new HTTPException(400, { message: 'bad sha' })
  return c.text(await git.diff(projectDir(c.req.param('id')), sha))
})

api.post('/projects/:id/versions/:sha/preview', async (c) => {
  const row = await owned(c, 'view')
  const sha = c.req.param('sha')
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new HTTPException(400, { message: 'bad sha' })
  try {
    await buildVersion(row.id, sha)
  } catch (err) {
    throw new HTTPException(422, { message: (err as Error).message })
  }
  return c.json({ url: `/v/${row.id}/${sha}/` })
})

api.post('/projects/:id/versions/:sha/restore', async (c) => {
  const row = await owned(c)
  const sha = c.req.param('sha')
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new HTTPException(400, { message: 'bad sha' })
  if (agent.isRunning(row.id)) throw new HTTPException(409, { message: 'Wait for the current response to finish' })
  const dir = projectDir(row.id)
  const target = (await git.log(dir)).find((v) => v.sha.startsWith(sha))
  if (!target) throw new HTTPException(404, { message: 'Version not found' })
  const before = await git.head(dir)
  const title = `Restored “${target.title}”`
  const commit = await git.restore(dir, target.sha, title)
  if (commit) {
    const changed = await git.changedFiles(dir, before, commit)
    if (changed.includes('package.json')) await sandbox.install(row.id)
    publish(row.id, { type: 'files', paths: changed })
    if (target.sha === row.lastGoodCommit) publish(row.id, { type: 'project', project: await projects.update(row.id, { lastGoodCommit: commit }) })
  }
  const note = await messages.create(row.id, 'assistant', [{ type: 'text', text: `Restored the project to “${target.title}”. Database data is not affected.` }, ...(commit ? [{ type: 'version' as const, sha: commit, title }] : [])])
  await messages.save(note.id, { commitSha: commit })
  publish(row.id, { type: 'message', message: messages.toMessage({ ...note, commitSha: commit }) })
  publish(row.id, { type: 'versions' })
  return c.json({ sha: commit })
})

api.get('/projects/:id/download', async (c) => {
  const row = await owned(c)
  const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || row.id
  const zip = await git.archive(projectDir(row.id), slug)
  return c.body(new Uint8Array(zip), 200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${slug}.zip"` })
})

api.post('/projects/:id/uploads', async (c) => {
  await owned(c)
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'file required' })
  const ext = IMAGE_EXT[file.type]
  if (!ext) throw new HTTPException(415, { message: 'Only PNG, JPEG, WebP and GIF images are supported' })
  if (file.size > MAX_UPLOAD) throw new HTTPException(413, { message: 'Image is larger than 10 MB' })
  const dir = path.join(config.dataDir, 'uploads', c.req.param('id'))
  await mkdir(dir, { recursive: true })
  const name = `${randomUUID()}.${ext}`
  await writeFile(path.join(dir, name), new Uint8Array(await file.arrayBuffer()))
  return c.json({ url: `/api/projects/${c.req.param('id')}/uploads/${name}`, name: file.name }, 201)
})

api.get('/projects/:id/thumbnail', async (c) => {
  const row = await owned(c)
  const file = thumbnailPath(row.id)
  if (!existsSync(file)) {
    if (!browserAvailable() || agent.isRunning(row.id)) throw new HTTPException(404)
    const shot = await capture(row.id, '/').catch(() => null)
    if (!shot) throw new HTTPException(404)
    await saveThumbnail(row.id, shot.image)
  }
  return c.body(new Uint8Array(await readFile(file)), 200, { 'content-type': 'image/jpeg', 'cache-control': 'private, no-cache' })
})

api.get('/projects/:id/uploads/:name', async (c) => {
  await owned(c)
  const name = c.req.param('name')
  if (!/^[0-9a-f-]+\.(png|jpg|webp|gif)$/.test(name)) throw new HTTPException(404)
  const file = path.join(config.dataDir, 'uploads', c.req.param('id'), name)
  if (!existsSync(file)) throw new HTTPException(404)
  const ext = name.split('.').pop()!
  return c.body(new Uint8Array(await readFile(file)), 200, { 'content-type': ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, 'cache-control': 'private, max-age=31536000, immutable' })
})

api.post('/projects/:id/preview-logs', async (c) => {
  await owned(c, 'view')
  const entries = await body<{ level?: string; message?: string }[]>(c)
  for (const e of (Array.isArray(entries) ? entries : []).slice(0, 100)) {
    if (typeof e?.message === 'string') sandbox.pushLog(c.req.param('id'), { source: 'browser', level: String(e.level ?? 'log'), message: e.message.slice(0, 4000) })
  }
  return c.body(null, 204)
})

api.post('/projects/:id/sandbox/restart', async (c) => {
  await owned(c)
  sandbox.clearLogs(c.req.param('id'))
  await sandbox.restartDev(c.req.param('id'))
  return c.json(sandbox.status(c.req.param('id')))
})

api.get('/projects/:id/visual-edit', async (c) => {
  const row = await owned(c)
  const oid = c.req.query('oid')
  if (!oid) throw new HTTPException(400, { message: 'oid required' })
  return c.json(await inspect(row.id, oid))
})

api.post('/projects/:id/visual-edit', async (c) => {
  const row = await owned(c)
  if (agent.isRunning(row.id)) throw new HTTPException(409, { message: 'Wait for the current response to finish' })
  const input = await body<{ oid?: string; texts?: TextSegment[]; styles?: StyleChanges }>(c)
  if (typeof input.oid !== 'string') throw new HTTPException(400, { message: 'oid required' })
  const texts = Array.isArray(input.texts) ? input.texts.filter((t) => Number.isInteger(t?.id) && typeof t.value === 'string') : undefined
  const result = await visualEdit(row.id, input.oid, { texts, styles: input.styles })
  publish(row.id, { type: 'files', paths: [result.file] })
  const sha = await git.commitAll(projectDir(row.id), `Visual edit in ${result.file}`)
  if (sha) publish(row.id, { type: 'versions' })
  return c.json({ ...result, sha })
})

api.post('/projects/:id/approvals/:approvalId', async (c) => {
  await owned(c)
  const input = await body<{ approved?: boolean; values?: Record<string, string> }>(c)
  const values = input.values && typeof input.values === 'object' ? Object.fromEntries(Object.entries(input.values).filter(([k, v]) => typeof v === 'string' && /^[A-Z][A-Z0-9_]*$/.test(k))) : undefined
  if (!approvals.decide(c.req.param('id'), c.req.param('approvalId'), { approved: input.approved === true, values })) throw new HTTPException(404, { message: 'This request is no longer pending' })
  return c.body(null, 204)
})

const backendOf = async (c: Parameters<typeof owned>[0]) => {
  const row = await owned(c)
  if (!(await backend.isEnabled(row.id))) throw new HTTPException(404, { message: 'Backend is not enabled for this project' })
  return row
}

api.get('/projects/:id/backend', async (c) => {
  const row = await owned(c, 'edit')
  if (!(await backend.isEnabled(row.id))) return c.json({ enabled: false })
  await backend.ensure(row.id)
  const tables = await backend.schema(row.id)
  const secrets = await sql<{ name: string; createdAt: Date }[]>`select name, created_at from secrets where project_id = ${row.id} order by name`
  return c.json({ enabled: true, status: backend.status(row.id), tables, findings: backend.scan(tables), secrets: secrets.map((s) => ({ name: s.name, createdAt: s.createdAt.toISOString() })) })
})

api.get('/projects/:id/backend/tables/:table', async (c) => {
  const row = await backendOf(c)
  const table = c.req.param('table')
  const tables = await backend.schema(row.id)
  if (!tables.some((t) => t.name === table)) throw new HTTPException(404, { message: 'Table not found' })
  const rows = await backend.queryJson<Record<string, unknown>[]>(row.id, `select * from public."${table.replace(/"/g, '')}" limit 200`)
  return c.json(rows)
})

api.get('/projects/:id/backend/users', async (c) => {
  const row = await backendOf(c)
  return c.json(await backend.queryJson(row.id, 'select id, email, created_at, last_sign_in_at from auth.users order by created_at desc limit 200'))
})

api.put('/projects/:id/backend/secrets/:name', async (c) => {
  const row = await backendOf(c)
  const name = c.req.param('name')
  const { value } = await body<{ value?: string }>(c)
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== 'string' || !value.trim()) throw new HTTPException(400, { message: 'Invalid secret' })
  await sql`insert into secrets (project_id, name, value) values (${row.id}, ${name}, ${value.trim()}) on conflict (project_id, name) do update set value = excluded.value`
  await backend.restartFunctions(row.id)
  return c.body(null, 204)
})

api.delete('/projects/:id/backend/secrets/:name', async (c) => {
  const row = await backendOf(c)
  await sql`delete from secrets where project_id = ${row.id} and name = ${c.req.param('name')}`
  await backend.restartFunctions(row.id)
  return c.body(null, 204)
})

export default api
