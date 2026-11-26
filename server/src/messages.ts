import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { HTTPException } from 'hono/http-exception'
import type { ChatMode, Message, MessageStatus, Part, SelectedElement } from '../../shared/types.ts'
import { sql } from './db.ts'

type Row = {
  id: string
  projectId: string
  chatId: string
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

const json = (value: unknown) => sql.json(JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'string' ? v.replaceAll('\0', '\uFFFD') : v))))

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
    insert into messages (project_id, chat_id, role, parts, mode, status, author_id)
    values (${projectId}, (select id from chats where project_id = ${projectId} order by created_at desc limit 1), ${role}, ${json(parts)}, ${opts.mode ?? 'build'}, ${opts.status ?? 'done'}, ${opts.author?.id ?? null})
    returning *`
  return { ...row, authorName: opts.author?.name ?? null }
}

export async function save(id: string, fields: { parts?: Part[]; transcript?: ChatCompletionMessageParam[]; status?: MessageStatus; commitSha?: string | null; durationMs?: number }) {
  await sql`
    update messages set
      parts = coalesce(${fields.parts ? json(fields.parts) : null}, parts),
      transcript = coalesce(${fields.transcript ? json(fields.transcript) : null}, transcript),
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

export async function authorEmail(id: string): Promise<string | null> {
  const [row] = await sql<{ email: string | null }[]>`select u.email from messages m join users u on u.id = m.author_id where m.id = ${id}`
  return row?.email ?? null
}

export async function markInterrupted() {
  await sql`update messages set status = 'stopped' where status = 'streaming'`
}

export function userParts(input: { text?: string; images?: { url: string; name: string }[]; elements?: SelectedElement[] }): Part[] {
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
