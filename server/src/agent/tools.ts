import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChatMode, Part, PlanPart, QuestionPart } from '../../../shared/types.ts'
import { config, projectDir } from '../config.ts'
import { HTTPException } from 'hono/http-exception'
import { safePath } from '../projects.ts'
import * as sandbox from '../sandbox.ts'
import { fixAssetStrings, fixLucideImports, lucideNames } from './fixers.ts'
import { DESIGN_BRIEF_PROMPT } from './prompt.ts'
import * as approvals from '../approvals.ts'
import * as backend from '../backend.ts'
import * as browser from '../browser.ts'
import { sql } from '../db.ts'
import sharp from 'sharp'
import { generateImage } from './images.ts'
import { complete } from './llm.ts'

export type ToolContext = {
  emit: (part: Part) => number
  update: (index: number, part: Part) => void
  projectId: string
  model: string
  mode: ChatMode
  signal: AbortSignal
  changed: Set<string>
  startedAt: number
}

export type ToolResult = { output: string; summary?: string; error?: boolean; endTurn?: boolean; part?: Part; image?: Uint8Array }

type Schema = Record<string, unknown>

type Tool = {
  name: string
  description: string
  parameters: Schema
  readOnly?: boolean
  label: (args: Args) => string
  run: (args: Args, ctx: ToolContext) => Promise<ToolResult>
}

type Args = Record<string, unknown>

const PROTECTED = [/^\.ouroboros\//, /^\.ouroboros-versions\//, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^node_modules\//, /^\.git\//]
const MAX_OUTPUT = 20_000

const truncate = (s: string, max = MAX_OUTPUT) => (s.length > max ? `${s.slice(0, max)}\n... [truncated ${s.length - max} chars]` : s)

const str = (args: Args, key: string): string => {
  const v = args[key]
  if (typeof v !== 'string' || !v) throw new ToolError(`Missing required string argument "${key}"`)
  return v
}

class ToolError extends Error {}

function rel(ctx: ToolContext, file: string): { rel: string; full: string } {
  let full: string
  try {
    full = safePath(ctx.projectId, file.replace(/^\/app\//, ''))
  } catch (err) {
    if (err instanceof HTTPException) throw new ToolError(`Invalid path "${file}"`)
    throw err
  }
  return { full, rel: path.relative(projectDir(ctx.projectId), full) }
}

function writable(ctx: ToolContext, file: string) {
  const p = rel(ctx, file)
  if (PROTECTED.some((re) => re.test(p.rel))) throw new ToolError(`"${p.rel}" is managed by the platform and cannot be modified`)
  return p
}

async function postProcess(ctx: ToolContext, relPath: string, content: string): Promise<{ content: string; notes: string[] }> {
  if (!/\.(tsx?|jsx?)$/.test(relPath)) return { content, notes: [] }
  const notes: string[] = []
  const assets = fixAssetStrings(content)
  if (assets.fixes.length) notes.push(`Auto-fixed image paths (string paths like "@/assets/x.jpg" don't work at runtime; they are now imports): ${assets.fixes.join(', ')}`)
  let code = assets.code
  if (code.includes('lucide-react')) {
    const names = await lucideNames(projectDir(ctx.projectId))
    if (names) {
      const icons = await fixLucideImports(code, names)
      code = icons.code
      if (icons.fixes.length) notes.push(`Auto-fixed unknown lucide icons: ${icons.fixes.join(', ')}`)
    }
  }
  return { content: code, notes }
}

async function saveFile(ctx: ToolContext, relPath: string, full: string, content: string) {
  const processed = await postProcess(ctx, relPath, content)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, processed.content)
  ctx.changed.add(relPath)
  return processed
}

const lineCount = (s: string) => s.split('\n').length

export function findBlock(content: string, needle: string): { index: number; length: number; count: number } {
  let count = 0
  let first = -1
  for (let i = content.indexOf(needle); i !== -1; i = content.indexOf(needle, i + needle.length)) {
    if (first === -1) first = i
    count++
  }
  if (count) return { index: first, length: needle.length, count }
  const lines = content.split('\n')
  const want = needle.split('\n').map((l) => l.trim())
  while (want.length && !want[want.length - 1]) want.pop()
  while (want.length && !want[0]) want.shift()
  if (!want.length) return { index: -1, length: 0, count: 0 }
  const offsets: number[] = []
  let pos = 0
  for (const line of lines) {
    offsets.push(pos)
    pos += line.length + 1
  }
  const hits: number[] = []
  for (let i = 0; i + want.length <= lines.length; i++) {
    if (want.every((w, j) => lines[i + j].trim() === w)) hits.push(i)
  }
  if (!hits.length) return { index: -1, length: 0, count: 0 }
  const start = hits[0]
  const end = start + want.length - 1
  return { index: offsets[start], length: offsets[end] + lines[end].length - offsets[start], count: hits.length }
}

async function walk(dir: string, root: string, out: string[], limit: number) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (out.length >= limit) return
    if (['node_modules', '.git', 'dist', '.pnpm-store', '.ouroboros-versions'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, root, out, limit)
    else out.push(path.relative(root, full))
  }
}

export const tools: Tool[] = [
  {
    name: 'read_file',
    description: 'Read a file from the project. Returns the content with line numbers. For large files use offset/limit (1-based line numbers).',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root, e.g. src/App.tsx' }, offset: { type: 'number' }, limit: { type: 'number' } },
      required: ['path'],
    },
    label: (a) => `Read ${a.path}`,
    async run(args, ctx) {
      const { full, rel: p } = rel(ctx, str(args, 'path'))
      if (!existsSync(full)) throw new ToolError(`File not found: ${p}`)
      if ((await stat(full)).isDirectory()) throw new ToolError(`${p} is a directory; use list_files`)
      const lines = (await readFile(full, 'utf8')).split('\n')
      const offset = Math.max(1, Number(args.offset) || 1)
      const limit = Number(args.limit) || 800
      const slice = lines.slice(offset - 1, offset - 1 + limit)
      const body = slice.map((l, i) => `${String(offset + i).padStart(4)}| ${l}`).join('\n')
      const more = offset - 1 + limit < lines.length ? `\n... (${lines.length} lines total; use offset to read more)` : ''
      return { output: truncate(body + more) }
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or completely overwrite an existing one. Always provide the COMPLETE file content. Prefer edit_file for small changes to existing files.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string', description: 'Full file content' } },
      required: ['path', 'content'],
    },
    label: (a) => `Wrote ${a.path}`,
    async run(args, ctx) {
      const { full, rel: p } = writable(ctx, str(args, 'path'))
      if (typeof args.content !== 'string') throw new ToolError('Missing "content"')
      const existed = existsSync(full)
      const { content, notes } = await saveFile(ctx, p, full, args.content)
      return { output: [`${existed ? 'Updated' : 'Created'} ${p} (${lineCount(content)} lines)`, ...notes].join('\n'), summary: `${lineCount(content)} lines` }
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace text in an existing file. old_string must match the file exactly (copy it from the file, without line-number prefixes) and be unique unless replace_all is true. Include enough surrounding lines to make it unique. Multiple calls on the same file are applied in order.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Exact existing text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    label: (a) => `Edited ${a.path}`,
    async run(args, ctx) {
      const { full, rel: p } = writable(ctx, str(args, 'path'))
      if (!existsSync(full)) throw new ToolError(`File not found: ${p}. Use write_file to create it.`)
      const oldString = str(args, 'old_string')
      if (typeof args.new_string !== 'string') throw new ToolError('Missing "new_string"')
      const content = await readFile(full, 'utf8')
      let next: string
      if (args.replace_all === true && content.includes(oldString)) {
        next = content.split(oldString).join(args.new_string)
      } else {
        const hit = findBlock(content, oldString)
        if (hit.index === -1) throw new ToolError(`old_string not found in ${p}. Read the file again and copy the exact text.`)
        if (hit.count > 1) throw new ToolError(`old_string matches ${hit.count} places in ${p}. Add more surrounding context or set replace_all.`)
        next = content.slice(0, hit.index) + args.new_string + content.slice(hit.index + hit.length)
      }
      const { notes } = await saveFile(ctx, p, full, next)
      const delta = lineCount(next) - lineCount(content)
      return { output: [`Edited ${p}`, ...notes].join('\n'), summary: delta === 0 ? 'changed' : `${delta > 0 ? '+' : ''}${delta} lines` }
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the project.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    label: (a) => `Deleted ${a.path}`,
    async run(args, ctx) {
      const { full, rel: p } = writable(ctx, str(args, 'path'))
      if (!existsSync(full)) throw new ToolError(`File not found: ${p}`)
      await rm(full, { recursive: true })
      ctx.changed.add(p)
      return { output: `Deleted ${p}` }
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file. Remember to update imports that reference it.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
    label: (a) => `Renamed ${a.from} → ${a.to}`,
    async run(args, ctx) {
      const from = writable(ctx, str(args, 'from'))
      const to = writable(ctx, str(args, 'to'))
      if (!existsSync(from.full)) throw new ToolError(`File not found: ${from.rel}`)
      await mkdir(path.dirname(to.full), { recursive: true })
      await rename(from.full, to.full)
      ctx.changed.add(from.rel).add(to.rel)
      return { output: `Renamed ${from.rel} to ${to.rel}` }
    },
  },
  {
    name: 'list_files',
    description: 'List files in the project (or a sub-directory). node_modules and .git are excluded.',
    readOnly: true,
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory, default project root' } } },
    label: (a) => `Listed ${a.path || 'files'}`,
    async run(args, ctx) {
      const root = projectDir(ctx.projectId)
      const dir = typeof args.path === 'string' && args.path ? rel(ctx, args.path).full : root
      if (!existsSync(dir)) throw new ToolError('Directory not found')
      const out: string[] = []
      await walk(dir, root, out, 1000)
      return { output: out.sort().join('\n') || '(empty)' }
    },
  },
  {
    name: 'search_files',
    description: 'Search file contents with a regular expression (case-insensitive). Returns matching lines as path:line: text.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string', description: 'Directory or file to search, default src' } },
      required: ['pattern'],
    },
    label: (a) => `Searched for "${a.pattern}"`,
    async run(args, ctx) {
      const root = projectDir(ctx.projectId)
      let re: RegExp
      try {
        re = new RegExp(str(args, 'pattern'), 'i')
      } catch {
        throw new ToolError('Invalid regular expression')
      }
      const dir = rel(ctx, typeof args.path === 'string' && args.path ? args.path : 'src').full
      if (!existsSync(dir)) throw new ToolError('Path not found')
      const files: string[] = []
      if ((await stat(dir)).isFile()) files.push(path.relative(root, dir))
      else await walk(dir, root, files, 5000)
      const hits: string[] = []
      for (const f of files) {
        if (!/\.(tsx?|jsx?|css|html|json|md|sql)$/.test(f)) continue
        const lines = (await readFile(path.join(root, f), 'utf8')).split('\n')
        lines.forEach((line, i) => {
          if (hits.length < 200 && re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`)
        })
      }
      return { output: hits.join('\n') || 'No matches', summary: `${hits.length} matches` }
    },
  },
  {
    name: 'add_dependency',
    description: 'Install npm packages into the project with pnpm. Call this BEFORE writing code that imports a new package.',
    parameters: {
      type: 'object',
      properties: { packages: { type: 'array', items: { type: 'string' }, description: 'Package names, optionally with version, e.g. ["framer-motion", "zod@^3"]' }, dev: { type: 'boolean' } },
      required: ['packages'],
    },
    label: (a) => `Installed ${(a.packages as string[] | undefined)?.join(', ')}`,
    async run(args, ctx) {
      const pkgs = (Array.isArray(args.packages) ? args.packages : []).filter((p): p is string => typeof p === 'string' && /^[@a-z0-9][\w./@^~<>=-]*$/i.test(p))
      if (!pkgs.length) throw new ToolError('No valid package names given')
      const res = await sandbox.execIn(ctx.projectId, `pnpm add ${args.dev ? '-D ' : ''}${pkgs.join(' ')}`, { timeoutMs: 300_000, signal: ctx.signal })
      ctx.changed.add('package.json')
      if (res.code !== 0) throw new ToolError(truncate(`pnpm add failed:\n${res.stderr || res.stdout}`, 4000))
      return { output: `Installed ${pkgs.join(', ')}` }
    },
  },
  {
    name: 'remove_dependency',
    description: 'Uninstall npm packages from the project.',
    parameters: { type: 'object', properties: { packages: { type: 'array', items: { type: 'string' } } }, required: ['packages'] },
    label: (a) => `Removed ${(a.packages as string[] | undefined)?.join(', ')}`,
    async run(args, ctx) {
      const pkgs = (Array.isArray(args.packages) ? args.packages : []).filter((p): p is string => typeof p === 'string' && /^[@a-z0-9][\w./@-]*$/i.test(p))
      if (!pkgs.length) throw new ToolError('No valid package names given')
      const res = await sandbox.execIn(ctx.projectId, `pnpm remove ${pkgs.join(' ')}`, { timeoutMs: 180_000, signal: ctx.signal })
      ctx.changed.add('package.json')
      if (res.code !== 0) throw new ToolError(truncate(`pnpm remove failed:\n${res.stderr || res.stdout}`, 4000))
      return { output: `Removed ${pkgs.join(', ')}` }
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the project sandbox (Linux, working directory = project root). Use for things like inspecting node_modules or running a one-off script. Never start the dev server or long-running processes; use add_dependency for installs.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    label: (a) => `Ran ${String(a.command).slice(0, 60)}`,
    async run(args, ctx) {
      const command = str(args, 'command')
      if (/\b(vite|pnpm\s+(run\s+)?dev|npm\s+(run\s+)?dev|pnpm\s+(run\s+)?preview)\b/.test(command) && !/vite\s+(build|--version)/.test(command)) {
        throw new ToolError('The dev server is managed by the platform and is already running.')
      }
      const res = await sandbox.execIn(ctx.projectId, command, { timeoutMs: 120_000, signal: ctx.signal })
      const out = `exit code ${res.code}${res.timedOut ? ' (timed out after 120s)' : ''}\n${res.stdout}${res.stderr ? `\n[stderr]\n${res.stderr}` : ''}`
      return { output: truncate(out), error: res.code !== 0, summary: `exit ${res.code}` }
    },
  },
  {
    name: 'read_logs',
    description: 'Read recent logs: dev server output (build/compile errors) and the browser console, runtime errors and failed network requests from the live preview. Use this first when debugging.',
    readOnly: true,
    parameters: { type: 'object', properties: { search: { type: 'string', description: 'Optional case-insensitive filter' } } },
    label: () => 'Read logs',
    async run(args, ctx) {
      const filter = typeof args.search === 'string' && args.search ? args.search.toLowerCase() : ''
      const entries = sandbox.logs(ctx.projectId).filter((e) => !filter || e.message.toLowerCase().includes(filter))
      if (!entries.length) return { output: 'No logs recorded.' }
      const fmt = (e: (typeof entries)[number]) => `[${new Date(e.at).toISOString().slice(11, 19)}] ${e.source}/${e.level}: ${e.message}`
      const recent = entries.filter((e) => e.at >= ctx.startedAt)
      const older = entries.filter((e) => e.at < ctx.startedAt).slice(-20)
      const out = [`Current time: ${new Date().toISOString().slice(11, 19)}. Errors that happened before a later fix are stale.`]
      if (older.length) out.push('--- before this request ---', ...older.map(fmt))
      out.push('--- during this request ---', ...(recent.length ? recent.slice(-100).map(fmt) : ['(nothing yet)']))
      return { output: truncate(out.join('\n')) }
    },
  },
  {
    name: 'check_project',
    description: 'Type-check the project (tsc) and lint the files you changed for real bugs. Call after making changes and fix every reported error.',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    label: () => 'Checked for errors',
    async run(_args, ctx) {
      const res = await typecheck(ctx.projectId, ctx.signal)
      if (!res.ok) return { output: truncate(res.output), error: true, summary: 'errors found' }
      const linted = await lint(ctx.projectId, ctx.changed, ctx.signal)
      return linted.ok ? { output: 'No type or lint errors.', summary: 'passed' } : { output: truncate(`Lint errors:\n${linted.output}`), error: true, summary: 'errors found' }
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch a web page or API URL and return its text content (HTML is converted to plain text). Useful when the user shares a link or you need documentation.',
    readOnly: true,
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    label: (a) => `Fetched ${String(a.url).replace(/^https?:\/\//, '').slice(0, 50)}`,
    async run(args, ctx) {
      const url = str(args, 'url')
      if (!/^https?:\/\//.test(url)) throw new ToolError('Only http(s) URLs are supported')
      const res = await fetch(url, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)]), headers: { 'user-agent': 'Mozilla/5.0 Ouroboros' } })
      const type = res.headers.get('content-type') ?? ''
      let body = await res.text()
      if (type.includes('html')) {
        body = body
          .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
          .replace(/<\/(p|div|h\d|li|tr|section|article|header|footer|br)>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n+/g, '\n\n')
          .trim()
      }
      return { output: truncate(`HTTP ${res.status}\n${body}`, 15_000) }
    },
  },
  {
    name: 'generate_design_brief',
    description: 'Get a concrete design brief (palette, fonts, layout, details) for a new app or a major redesign. Follow the brief when implementing.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { goal: { type: 'string', description: 'What is being built' }, context: { type: 'string', description: 'Brand adjectives, constraints, user preferences' } },
      required: ['goal'],
    },
    label: () => 'Generated design brief',
    async run(args, ctx) {
      const brief = await complete(ctx.model, DESIGN_BRIEF_PROMPT, `${str(args, 'goal')}\n${typeof args.context === 'string' ? args.context : ''}`, 6000)
      return { output: brief || 'No brief generated; use your own judgement following the design rules.' }
    },
  },
  {
    name: 'generate_image',
    description:
      'Generate a real image (photo or illustration) from a text prompt and save it into the project. Use it for hero images, feature/product photos, backgrounds and avatars instead of placeholder images. Save under src/assets/ (prefer .jpg) and import it in code as an ES module (import hero from "@/assets/hero.jpg"). Describe subject, style, lighting and composition; mention the aspect ratio. Takes ~10-30s per image, so generate only the images that matter (usually 1-4).',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed image description' },
        path: { type: 'string', description: 'e.g. src/assets/hero.jpg (.jpg recommended for photos, .png for graphics with transparency)' },
        width: { type: 'number', description: '512-1536, default 1024' },
        height: { type: 'number', description: '512-1536, default 1024' },
      },
      required: ['prompt', 'path'],
    },
    label: (a) => `Generated ${a.path}`,
    async run(args, ctx) {
      const { full, rel: p } = writable(ctx, str(args, 'path'))
      if (!/\.(jpe?g|png|webp)$/.test(p)) throw new ToolError('Image path must end with .jpg, .png or .webp')
      const png = await generateImage(str(args, 'prompt'), Number(args.width) || 1024, Number(args.height) || 1024, ctx.signal)
      const image = p.endsWith('.png') ? png : await (p.endsWith('.webp') ? sharp(png).webp({ quality: 82 }) : sharp(png).jpeg({ quality: 82, mozjpeg: true })).toBuffer()
      await mkdir(path.dirname(full), { recursive: true })
      await writeFile(full, image)
      ctx.changed.add(p)
      return { output: `Saved ${p} (${Math.round(image.length / 1024)} KB). Import it with: import img from "@/${p.replace(/^src\//, '')}"`, summary: `${Math.round(image.length / 1024)} KB` }
    },
  },
  {
    name: 'screenshot',
    description: 'Open the app in a headless browser and look at it: returns a screenshot of a route plus any runtime errors. Use it to visually verify layout and design after big changes, or when the user reports something looks wrong.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { route: { type: 'string', description: 'App route, default "/"' }, mobile: { type: 'boolean', description: 'Use a 390px wide phone viewport' } },
    },
    label: (a) => `Viewed ${a.route || '/'}${a.mobile ? ' on mobile' : ''}`,
    async run(args, ctx) {
      if (!browser.available()) throw new ToolError('Screenshots are not available on this server')
      const route = typeof args.route === 'string' && args.route ? args.route : '/'
      const shot = await browser.capture(ctx.projectId, route, args.mobile ? { width: 390, height: 844 } : {})
      return { output: `Screenshot of ${route} attached below.${shot.errors.length ? `\nRuntime errors:\n${shot.errors.join('\n')}` : '\nNo runtime errors.'}`, image: shot.image }
    },
  },
  {
    name: 'enable_backend',
    description:
      'Turn on the built-in backend (Postgres database, email/password auth, file storage, server functions) for this app. Call this once, before building anything that needs to store data across users/devices, user accounts, file uploads or secret API keys. After it, use run_migration for tables and import { supabase } from "@/integrations/supabase/client".',
    parameters: { type: 'object', properties: {} },
    label: () => 'Enabled backend',
    async run(_args, ctx) {
      await sql`update projects set backend = true where id = ${ctx.projectId}`
      await backend.ensure(ctx.projectId)
      const c = await backend.creds(ctx.projectId)
      const file = path.join(projectDir(ctx.projectId), 'src/integrations/supabase/client.ts')
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, backend.clientFile(ctx.projectId, c.anonKey))
      ctx.changed.add('src/integrations/supabase/client.ts')
      const pkg = JSON.parse(await readFile(path.join(projectDir(ctx.projectId), 'package.json'), 'utf8'))
      if (!pkg.dependencies?.['@supabase/supabase-js']) {
        const res = await sandbox.execIn(ctx.projectId, 'pnpm add @supabase/supabase-js', { timeoutMs: 300_000, signal: ctx.signal })
        if (res.code !== 0) throw new ToolError(`Installing @supabase/supabase-js failed:\n${(res.stderr || res.stdout).slice(-1500)}`)
        ctx.changed.add('package.json')
      }
      return {
        output: `Backend is ready. Client: import { supabase } from "@/integrations/supabase/client" (supabase-js v2: auth, from(), storage, functions.invoke). Next: create tables with run_migration (always enable RLS + policies). Server functions go in supabase/functions/<name>/index.ts.`,
      }
    },
  },
  {
    name: 'get_database_schema',
    description: 'Show the current database tables, columns, row level security status and policies.',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    label: () => 'Read database schema',
    async run(_args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) return { output: 'The backend is not enabled for this project. Call enable_backend first if the app needs one.' }
      const tables = await backend.schema(ctx.projectId)
      if (!tables.length) return { output: 'No tables in the public schema yet.' }
      return {
        output: tables
          .map((t) => `table ${t.name} (rls: ${t.rls ? 'on' : 'OFF'})\n${t.columns.map((c) => `  ${c.name} ${c.type}${c.nullable ? '' : ' not null'}${c.default ? ` default ${c.default}` : ''}`).join('\n')}${t.policies.length ? `\n  policies:\n${t.policies.map((p) => `    "${p.name}" ${p.command} to ${p.roles.join(',')} using (${p.using ?? '-'}) check (${p.check ?? '-'})`).join('\n')}` : ''}`)
          .join('\n\n'),
      }
    },
  },
  {
    name: 'run_migration',
    description:
      'Change the database schema with SQL (create/alter tables, policies, functions, triggers, storage buckets). The user must approve it before it runs. Rules: every new table must "enable row level security" and get policies; prefer user_id uuid references auth.users default auth.uid(); never drop tables or columns with data unless the user explicitly asked; use "if not exists" where possible. Do not include begin/commit.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Short snake_case description, e.g. create_todos' }, sql: { type: 'string' } },
      required: ['name', 'sql'],
    },
    label: (a) => `Migration ${a.name}`,
    async run(args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) throw new ToolError('Call enable_backend first')
      const name = str(args, 'name')
      const query = str(args, 'sql')
      if (/^\s*(begin|commit|rollback)\s*;/im.test(query)) throw new ToolError('Do not include transaction control statements; the migration runs in a transaction automatically.')
      const id = crypto.randomUUID()
      const index = ctx.emit({ type: 'migration', id, name, sql: query, status: 'pending' })
      const decision = await approvals.wait(ctx.projectId, id, ctx.signal)
      if (!decision.approved) {
        ctx.update(index, { type: 'migration', id, name, sql: query, status: 'rejected' })
        return { output: 'The user rejected this migration. Ask what they would like to change, or continue without it.', error: true }
      }
      const res = await backend.applyMigration(ctx.projectId, name, query)
      if (res.file) ctx.changed.add(res.file)
      ctx.update(index, { type: 'migration', id, name, sql: query, status: res.ok ? 'applied' : 'failed', error: res.ok ? undefined : res.output.slice(0, 2000) })
      if (!res.ok) throw new ToolError(`Migration failed and was rolled back:\n${res.output.slice(0, 3000)}`)
      const findings = backend.scan(await backend.schema(ctx.projectId)).filter((f) => f.level === 'error')
      return { output: `Migration applied${res.file ? ` and saved to ${res.file}` : ''}.${findings.length ? `\nSECURITY PROBLEMS — fix with another migration:\n${findings.map((f) => `- ${f.message}`).join('\n')}` : ''}` }
    },
  },
  {
    name: 'query_database',
    description: 'Run a read-only SQL query (SELECT) against the app database to inspect data. Results are returned as JSON (max 50 rows).',
    readOnly: true,
    parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
    label: () => 'Queried database',
    async run(args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) throw new ToolError('The backend is not enabled')
      const q = str(args, 'sql').trim().replace(/;\s*$/, '')
      if (!/^(select|with)\b/i.test(q)) throw new ToolError('Only SELECT queries are allowed here; use run_migration for changes')
      try {
        const rows = await backend.queryJson<unknown[]>(ctx.projectId, `select * from (${q}) q limit 50`)
        return { output: truncate(JSON.stringify(rows, null, 1), 12_000), summary: `${rows.length} rows` }
      } catch (err) {
        throw new ToolError((err as Error).message.slice(0, 2000))
      }
    },
  },
  {
    name: 'security_scan',
    description: 'Check the database for security problems (tables without row level security, policies that let anyone modify data).',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    label: () => 'Ran security scan',
    async run(_args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) return { output: 'No backend enabled; nothing to scan.' }
      const findings = backend.scan(await backend.schema(ctx.projectId))
      return { output: findings.length ? findings.map((f) => `[${f.level}] ${f.message}`).join('\n') : 'No security issues found.', summary: `${findings.length} findings` }
    },
  },
  {
    name: 'request_secrets',
    description:
      'Ask the user to securely enter secret values (API keys, tokens) needed by server functions. You never see the values; they become environment variables in server functions (Deno.env.get("NAME")). Never ask for secrets in chat and never put them in frontend code.',
    parameters: {
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' }, description: 'UPPER_SNAKE_CASE names, e.g. ["STRIPE_SECRET_KEY"]' }, reason: { type: 'string', description: 'One sentence explaining what they are for and where to get them' } },
      required: ['names', 'reason'],
    },
    label: (a) => `Requested ${(a.names as string[] | undefined)?.join(', ')}`,
    async run(args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) throw new ToolError('Call enable_backend first')
      const names = (Array.isArray(args.names) ? args.names : []).filter((n): n is string => typeof n === 'string' && /^[A-Z][A-Z0-9_]*$/.test(n)).slice(0, 5)
      if (!names.length) throw new ToolError('Provide UPPER_SNAKE_CASE secret names')
      const reason = str(args, 'reason')
      const id = crypto.randomUUID()
      const index = ctx.emit({ type: 'secret-request', id, names, reason, status: 'pending' })
      const decision = await approvals.wait(ctx.projectId, id, ctx.signal)
      const provided = Object.entries(decision.values ?? {}).filter(([k, v]) => names.includes(k) && v.trim())
      for (const [name, value] of provided) {
        await sql`insert into secrets (project_id, name, value) values (${ctx.projectId}, ${name}, ${value.trim()}) on conflict (project_id, name) do update set value = excluded.value`
      }
      ctx.update(index, { type: 'secret-request', id, names, reason, status: decision.approved && provided.length ? 'provided' : 'skipped' })
      if (!decision.approved || !provided.length) return { output: 'The user skipped entering the secrets. Continue without them or explain why they are needed.', error: true }
      await backend.restartFunctions(ctx.projectId)
      return { output: `Secrets ${provided.map(([k]) => k).join(', ')} are now available to server functions as environment variables.` }
    },
  },
  {
    name: 'read_function_logs',
    description: 'Read recent output and errors from the server functions (console.log/console.error in supabase/functions).',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    label: () => 'Read function logs',
    async run(_args, ctx) {
      if (!(await backend.isEnabled(ctx.projectId))) return { output: 'No backend enabled.' }
      return { output: truncate((await backend.functionLogs(ctx.projectId)) || 'No function logs yet.', 8000) }
    },
  },
  {
    name: 'update_plan',
    description: 'Show the user a checklist for multi-step work (3-7 milestone tasks). Call again to update statuses as you progress. Skip for small single-step changes.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] } }, required: ['title', 'status'] },
        },
      },
      required: ['tasks'],
    },
    label: () => 'Updated plan',
    async run(args) {
      const tasks = (Array.isArray(args.tasks) ? args.tasks : [])
        .filter((t): t is { title: string; status: string } => typeof t?.title === 'string')
        .map((t) => ({ title: t.title, status: (['pending', 'in_progress', 'done'].includes(t.status) ? t.status : 'pending') as PlanPart['tasks'][number]['status'] }))
      return { output: 'Plan updated.', part: { type: 'plan', tasks } }
    },
  },
  {
    name: 'ask_user',
    description:
      'Ask the user 1-3 clarifying questions with clickable options, then stop and wait for their answer. Use only when the request is genuinely ambiguous and the choice matters. Never call other tools in the same step.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label'] } },
              multiSelect: { type: 'boolean' },
            },
            required: ['question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
    label: () => 'Asked a question',
    async run(args) {
      const questions = (Array.isArray(args.questions) ? args.questions : [])
        .filter((q) => typeof q?.question === 'string')
        .slice(0, 3)
        .map((q) => ({
          question: q.question as string,
          multiSelect: q.multiSelect === true,
          options: (Array.isArray(q.options) ? q.options : [])
            .filter((o: { label?: unknown }) => typeof o?.label === 'string')
            .slice(0, 5)
            .map((o: { label: string; description?: unknown }) => ({ label: o.label, description: typeof o.description === 'string' ? o.description : undefined })),
        }))
      if (!questions.length) throw new ToolError('Provide at least one question')
      const part: QuestionPart = { type: 'question', id: crypto.randomUUID(), questions }
      return { output: 'Questions shown to the user. Waiting for their answer.', part, endTurn: true }
    },
  },
]

export async function typecheck(projectId: string, signal?: AbortSignal): Promise<{ ok: boolean; output: string }> {
  const res = await sandbox.execIn(projectId, 'pnpm exec tsc -b --pretty false 2>&1', { timeoutMs: 180_000, signal })
  const output = (res.stdout + res.stderr).trim()
  return { ok: res.code === 0, output: output || `tsc exited with ${res.code}` }
}

const LINT_RULES = ['react/rules-of-hooks', 'react/jsx-key', 'react/jsx-no-duplicate-props']

/** Lints the files changed this turn for real bugs only (warnings are ignored), so the model is not sent on style chores. */
export async function lint(projectId: string, files: Iterable<string>, signal?: AbortSignal): Promise<{ ok: boolean; output: string }> {
  const targets = [...files].filter((f) => /^src\/[\w./@-]+\.tsx?$/.test(f) && !f.startsWith('src/components/ui/') && existsSync(path.join(projectDir(projectId), f)))
  if (!targets.length) return { ok: true, output: '' }
  const res = await sandbox.execIn(projectId, `pnpm exec oxlint --quiet --format unix ${LINT_RULES.map((r) => `-D ${r}`).join(' ')} ${targets.join(' ')} 2>&1`, { timeoutMs: 60_000, signal })
  return { ok: res.code === 0, output: (res.stdout + res.stderr).trim() }
}

export function toolsFor(mode: ChatMode) {
  const available = tools.filter((t) => (t.name === 'generate_image' ? Boolean(config.comfy.url) : t.name === 'screenshot' ? browser.available() : true))
  return mode === 'plan' ? available.filter((t) => t.readOnly && t.name !== 'update_plan' && t.name !== 'generate_design_brief') : available
}

export function toolSchemas(mode: ChatMode) {
  return toolsFor(mode).map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<{ label: string; args: Args; result: ToolResult }> {
  const tool = toolsFor(ctx.mode).find((t) => t.name === name)
  let args: Args = {}
  try {
    args = rawArgs.trim() ? JSON.parse(rawArgs) : {}
  } catch {
    return { label: name, args: {}, result: { output: `Invalid JSON arguments for ${name}. Send valid JSON.`, error: true } }
  }
  if (!tool) return { label: name, args, result: { output: `Unknown tool "${name}"${ctx.mode === 'plan' ? ' (plan mode is read-only)' : ''}`, error: true } }
  const label = tool.label(args)
  try {
    return { label, args, result: await tool.run(args, ctx) }
  } catch (err) {
    if (err instanceof ToolError) return { label, args, result: { output: `Error: ${err.message}`, error: true } }
    if (ctx.signal.aborted) throw err
    return { label, args, result: { output: `Error: ${(err as Error).message}`, error: true } }
  }
}
