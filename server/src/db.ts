import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

export let sql: postgres.Sql

export async function connect(url: string, readOnly = false) {
  sql = postgres(url, {
    onnotice: () => {},
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } },
    connection: readOnly ? { default_transaction_read_only: true } : {},
  })
  if (readOnly) return
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  const dir = path.resolve(import.meta.dirname, '../migrations')
  const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name))
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue
    const body = await readFile(path.join(dir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into schema_migrations (name) values (${file})`
    })
  }
}
