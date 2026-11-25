import { HTTPException } from 'hono/http-exception'
import type { QueuedInput, QueuedMessage } from '../../shared/types.ts'
import { sql } from './db.ts'
import { publish as send } from './events.ts'

const MAX = 20

type Row = { id: string; projectId: string; authorId: string | null; authorName: string | null; input: QueuedInput; createdAt: Date }

const toQueued = (r: Row): QueuedMessage => ({ id: r.id, input: r.input, authorId: r.authorId, authorName: r.authorName, createdAt: r.createdAt.toISOString() })

const rows = (projectId: string) => sql<Row[]>`
  select q.*, u.name as author_name from queued_messages q left join users u on u.id = q.author_id
  where q.project_id = ${projectId} order by q.created_at, q.id`

export async function list(projectId: string): Promise<QueuedMessage[]> {
  return (await rows(projectId)).map(toQueued)
}

export async function add(projectId: string, authorId: string, input: QueuedInput) {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from queued_messages where project_id = ${projectId}`
  if (count >= MAX) throw new HTTPException(409, { message: `The queue holds at most ${MAX} messages` })
  await sql`insert into queued_messages (project_id, author_id, input) values (${projectId}, ${authorId}, ${sql.json(input as never)})`
}

export async function next(projectId: string): Promise<Row | undefined> {
  return (await rows(projectId))[0]
}

export async function remove(projectId: string, id: string) {
  await sql`delete from queued_messages where project_id = ${projectId} and id = ${id}`
}

export async function pending(): Promise<string[]> {
  return (await sql<{ projectId: string }[]>`select distinct project_id from queued_messages`).map((r) => r.projectId)
}

export async function takeAll(projectId: string): Promise<QueuedMessage[]> {
  const taken = await list(projectId)
  if (!taken.length) return []
  await sql`delete from queued_messages where id in ${sql(taken.map((q) => q.id))}`
  await publish(projectId)
  return taken
}

export async function publish(projectId: string) {
  send(projectId, { type: 'queue', queue: await list(projectId) })
}
