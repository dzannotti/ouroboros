import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { config } from '../config.ts'
import { embed } from './llm.ts'

const cache = new Map<string, { mtime: number; names: Set<string> }>()

export async function lucideNames(projectRoot: string): Promise<Set<string> | null> {
  const file = path.join(projectRoot, 'node_modules/lucide-react/dist/lucide-react.d.ts')
  if (!existsSync(file)) return null
  const { mtimeMs } = await stat(file)
  const hit = cache.get(file)
  if (hit && hit.mtime === mtimeMs) return hit.names
  const src = await readFile(file, 'utf8')
  const names = new Set<string>()
  for (const block of src.matchAll(/export \{([^}]*)\}/g)) {
    for (const spec of block[1].split(',')) {
      const name = spec.trim().split(/\s+as\s+/).pop()
      if (name && /^[A-Z]/.test(name)) names.add(name)
    }
  }
  cache.set(file, { mtime: mtimeMs, names })
  return names
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

const words = (name: string) => name.replace(/Icon$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()

type IconIndex = { names: string[]; vectors: number[][] }
let iconVectors: IconIndex | null = null

async function iconIndex(names: Set<string>): Promise<IconIndex> {
  const list = [...names].filter((n) => !n.endsWith('Icon') && !n.startsWith('Lucide'))
  if (iconVectors && iconVectors.names.length === list.length) return iconVectors
  const file = path.join(config.dataDir, `lucide-vectors-${list.length}.json`)
  if (existsSync(file)) return (iconVectors = JSON.parse(await readFile(file, 'utf8')) as IconIndex)
  const vectors: number[][] = []
  for (let i = 0; i < list.length; i += 256) vectors.push(...(await embed(list.slice(i, i + 256).map(words))))
  iconVectors = { names: list, vectors }
  await writeFile(file, JSON.stringify(iconVectors))
  return iconVectors
}

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

export async function nearestIcon(name: string, names: Set<string>): Promise<string> {
  const lower = new Map([...names].map((n) => [n.toLowerCase(), n]))
  const direct = lower.get(name.toLowerCase()) ?? lower.get(name.replace(/Icon$/, '').toLowerCase())
  if (direct) return direct
  let best = ''
  let bestDistance = Infinity
  for (const n of names) {
    const d = levenshtein(name, n)
    if (d < bestDistance) [best, bestDistance] = [n, d]
  }
  if (bestDistance <= 2) return best
  try {
    const index = await iconIndex(names)
    const [query] = await embed([words(name)])
    let score = -1
    index.names.forEach((n, i) => {
      const s = cosine(query, index.vectors[i])
      if (s > score) [best, score] = [n, s]
    })
  } catch {
    // embeddings unavailable: fall back to closest edit distance
  }
  return best
}

const LUCIDE_IMPORT = /import\s*(type\s*)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g

export async function fixLucideImports(code: string, names: Set<string>): Promise<{ code: string; fixes: string[] }> {
  const fixes: string[] = []
  const out: string[] = []
  let last = 0
  for (const m of code.matchAll(LUCIDE_IMPORT)) {
    const specs = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    const fixed: string[] = []
    for (const spec of specs) {
      const [imported, local] = spec.split(/\s+as\s+/)
      if (imported.startsWith('type ') || names.has(imported) || /^(LucideIcon|LucideProps|createLucideIcon|icons)$/.test(imported)) {
        fixed.push(spec)
        continue
      }
      const replacement = await nearestIcon(imported, names)
      fixes.push(`${imported} → ${replacement}`)
      fixed.push(`${replacement} as ${local ?? imported}`)
    }
    out.push(code.slice(last, m.index), `import ${m[1] ?? ''}{ ${fixed.join(', ')} } from 'lucide-react'`)
    last = m.index + m[0].length
  }
  if (!fixes.length) return { code, fixes }
  out.push(code.slice(last))
  return { code: out.join(''), fixes }
}

const builtins = new Set(builtinModules)

export function bareImports(code: string): string[] {
  const found = new Set<string>()
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
  for (const m of code.matchAll(re)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:') || spec.startsWith('virtual:')) continue
    const parts = spec.split('/')
    const pkg = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    if (!builtins.has(pkg)) found.add(pkg)
  }
  return [...found]
}

export async function missingDependencies(projectRoot: string, files: string[]): Promise<string[]> {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
  const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
  const missing = new Set<string>()
  for (const file of files) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue
    const full = path.join(projectRoot, file)
    if (!existsSync(full)) continue
    for (const dep of bareImports(await readFile(full, 'utf8'))) if (!declared.has(dep)) missing.add(dep)
  }
  return [...missing]
}

const ASSET_STRING = /(=\s*)?(["'`])((?:@\/|\/src\/|src\/)[^"'`\s]+\.(?:jpe?g|png|webp|gif|svg|avif))\2/g

export function fixAssetStrings(code: string): { code: string; fixes: string[] } {
  const imports = new Map<string, string>()
  for (const m of code.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+)["']/g)) imports.set(m[2], m[1])
  const lineStart = (i: number) => code.lastIndexOf('\n', i) + 1
  const used = new Set(code.match(/\b[A-Za-z_$][\w$]*\b/g) ?? [])
  const added: string[] = []
  const fixes: string[] = []
  const out = code.replace(ASSET_STRING, (match, eq: string | undefined, _q, raw: string, offset: number) => {
    const line = code.slice(lineStart(offset), offset)
    if (/\bfrom\s*$/.test(line) || /\bimport\s*\(\s*$/.test(line) || /^\s*import\s*$/.test(line)) return match
    const spec = raw.startsWith('@/') ? raw : `@/${raw.replace(/^\/?src\//, '')}`
    let name = imports.get(spec) ?? imports.get(raw)
    if (!name) {
      const base = spec.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))
      name = `${/^\d/.test(base) ? `img${base}` : base}Img`
      while (used.has(name)) name += '_'
      used.add(name)
      imports.set(spec, name)
      added.push(`import ${name} from '${spec}'`)
      fixes.push(`${raw} → import ${name}`)
    }
    return eq ? `${eq}{${name}}` : name
  })
  if (!added.length && out === code) return { code, fixes }
  const lastImport = [...out.matchAll(/^import[^\n]*\n/gm)].at(-1)
  const at = lastImport ? lastImport.index! + lastImport[0].length : 0
  return { code: out.slice(0, at) + (added.length ? `${added.join('\n')}\n` : '') + out.slice(at), fixes: fixes.length ? fixes : ['asset paths → imports'] }
}
