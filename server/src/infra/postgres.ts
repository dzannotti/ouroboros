import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.ts'
import { container, containerExec } from './runtime.ts'

const NAME = 'ouroboros-db'
const PORT = 5433

async function password() {
  const file = path.join(config.dataDir, 'db-password')
  if (existsSync(file)) return (await readFile(file, 'utf8')).trim()
  const pw = randomBytes(18).toString('hex')
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(file, pw, { mode: 0o600 })
  return pw
}

export async function ensureDatabase(): Promise<string> {
  if (config.databaseUrl) return config.databaseUrl
  const pw = await password()
  const inspect = await containerExec(['container', 'inspect', '-f', '{{.State.Running}}', NAME])
  if (inspect.code !== 0) {
    await container(['run', '-d', '--name', NAME, '--restart', 'unless-stopped', '-e', `POSTGRES_PASSWORD=${pw}`, '-e', 'POSTGRES_DB=ouroboros', '-v', 'ouroboros-db-data:/var/lib/postgresql/data', '-p', `127.0.0.1:${PORT}:5432`, 'docker.io/library/postgres:17-alpine'])
  } else if (inspect.stdout.trim() !== 'true') {
    await container(['start', NAME])
  }
  for (let i = 0; i < 60; i++) {
    const ready = await containerExec(['exec', NAME, 'pg_isready', '-U', 'postgres', '-d', 'ouroboros'])
    if (ready.code === 0) return `postgres://postgres:${pw}@127.0.0.1:${PORT}/ouroboros`
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Postgres did not become ready')
}
