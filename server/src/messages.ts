import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ChatMode, Message, MessageStatus, Part } from '../../shared/types.ts'
import { sql } from './db.ts'

type Row = {
  id: string
  projectId: string
  role: 'user' | 'assistant'
  parts: Part[]
  transcript: ChatCompletionMessageParam[]
  mode: ChatMode
  status: MessageStatus
  commitSha: string | null
  durationMs: number | null
  createdAt: Date
  authorId: string | null
  authorName?: string | null
}

export type StoredMessage = Row

export const toMessage = (r: Row): Message => ({
  id: r.id,
  projectId: r.projectId,
  role: r.role,
  parts: r.parts,
  status: r.status,
  commitSha: r.commitSha,
  durationMs: r.durationMs,
  mode: r.mode,
  createdAt: r.createdAt.toISOString(),
  authorId: r.authorId,
  authorName: r.authorName ?? null,
})

export async function create(projectId: string, role: 'user' | 'assistant', parts: Part[], opts: { mode?: ChatMode; status?: MessageStatus; author?: { id: string; name: string } } = {}): Promise<Row> {
  const [row] = await sql<Row[]>`
    insert into messages (project_id, role, parts, mode, status, author_id)
    values (${projectId}, ${role}, ${sql.json(parts as never)}, ${opts.mode ?? 'build'}, ${opts.status ?? 'done'}, ${opts.author?.id ?? null})
    returning *`
  return { ...row, authorName: opts.author?.name ?? null }
}

export async function save(id: string, fields: { parts?: Part[]; transcript?: ChatCompletionMessageParam[]; status?: MessageStatus; commitSha?: string | null; durationMs?: number }) {
  await sql`
    update messages set
      parts = coalesce(${fields.parts ? sql.json(fields.parts as never) : null}, parts),
      transcript = coalesce(${fields.transcript ? sql.json(fields.transcript as never) : null}, transcript),
      status = coalesce(${fields.status ?? null}, status),
      commit_sha = coalesce(${fields.commitSha ?? null}, commit_sha),
      duration_ms = coalesce(${fields.durationMs ?? null}, duration_ms)
    where id = ${id}`
}

export async function list(projectId: string): Promise<Row[]> {
  return sql<Row[]>`
    select m.*, (select name from users where id = m.author_id) as author_name
    from messages m where m.project_id = ${projectId} order by m.created_at, m.id`
}

export async function get(id: string): Promise<Row | undefined> {
  const [row] = await sql<Row[]>`select * from messages where id = ${id}`
  return row
}

export async function markInterrupted() {
  await sql`update messages set status = 'stopped' where status = 'streaming'`
}
