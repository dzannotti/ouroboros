import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectDir } from '../config.ts'
import { files as listFiles } from '../projects.ts'
import * as backend from '../backend.ts'
import { embed } from './llm.ts'

const ALWAYS = ['index.html', 'src/index.css', 'src/App.tsx']
const BUDGET = 60_000
const TEXT = /\.(tsx?|jsx?|css|html|json|md|sql)$/

const vectors = new Map<string, number[]>()

const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / Math.sqrt(na * nb)
}

async function rank(query: string, docs: { path: string; content: string }[]): Promise<string[]> {
  const keyed = docs.map((d) => ({ ...d, key: createHash('sha1').update(d.path + d.content).digest('hex') }))
  const missing = keyed.filter((d) => !vectors.has(d.key))
  for (let i = 0; i < missing.length; i += 64) {
    const batch = missing.slice(i, i + 64)
    const embedded = await embed(batch.map((d) => `${d.path}\n${d.content.slice(0, 3000)}`))
    batch.forEach((d, j) => vectors.set(d.key, embedded[j]))
  }
  const [q] = await embed([query])
  return keyed.map((d) => ({ path: d.path, score: cosine(q, vectors.get(d.key)!) })).sort((a, b) => b.score - a.score).map((d) => d.path)
}

function tree(paths: string[]) {
  const ui = paths.filter((p) => p.startsWith('src/components/ui/')).map((p) => path.basename(p, '.tsx'))
  const rest = paths.filter((p) => !p.startsWith('src/components/ui/') && !p.startsWith('.ouroboros/') && p !== 'pnpm-lock.yaml')
  return [...rest, `src/components/ui/ (shadcn, do not list again): ${ui.join(', ')}`].join('\n')
}

export async function projectContext(projectId: string, query: string, mustInclude: string[] = []): Promise<string> {
  const root = projectDir(projectId)
  const paths = await listFiles(projectId)
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const candidates = paths.filter((p) => TEXT.test(p) && p.startsWith('src/') && !p.startsWith('src/components/ui/') && !ALWAYS.includes(p))
  const docs = await Promise.all(candidates.map(async (p) => ({ path: p, content: await readFile(path.join(root, p), 'utf8') })))
  const total = docs.reduce((n, d) => n + d.content.length, 0)

  let order = docs.map((d) => d.path)
  if (total > BUDGET) {
    try {
      order = await rank(query, docs)
    } catch {
      // embeddings unavailable: keep alphabetical order
    }
  }
  order = [...new Set([...mustInclude.filter((p) => candidates.includes(p)), ...order])]

  const sections: string[] = []
  let used = 0
  for (const p of [...ALWAYS, ...order]) {
    const full = path.join(root, p)
    if (!existsSync(full)) continue
    const content = docs.find((d) => d.path === p)?.content ?? (await readFile(full, 'utf8'))
    if (used + content.length > BUDGET && !ALWAYS.includes(p) && !mustInclude.includes(p)) continue
    used += content.length
    sections.push(`<file path="${p}">\n${content}\n</file>`)
  }
  const omitted = order.length + ALWAYS.length - sections.length

  let backendInfo = '<backend>not enabled</backend>'
  if (await backend.isEnabled(projectId)) {
    try {
      const tables = await backend.schema(projectId)
      backendInfo = `<backend enabled="true">\nTables: ${tables.length ? tables.map((t) => `${t.name}(${t.columns.map((c) => c.name).join(', ')})${t.rls ? '' : ' RLS OFF'}`).join('; ') : 'none yet'}\n</backend>`
    } catch {
      backendInfo = '<backend enabled="true">schema unavailable right now</backend>'
    }
  }

  return `<project-context>
${backendInfo}
<file-tree>
${tree(paths)}
</file-tree>
<dependencies>${Object.keys(pkg.dependencies ?? {}).join(', ')}</dependencies>
<dev-dependencies>${Object.keys(pkg.devDependencies ?? {}).join(', ')}</dev-dependencies>
${sections.join('\n')}${omitted > 0 ? `\n(${omitted} other files not shown — use read_file if needed)` : ''}
</project-context>`
}
