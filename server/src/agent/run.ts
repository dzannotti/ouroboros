import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChatCompletionContentPart, ChatCompletionMessageFunctionToolCall, ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ChatMode, CheckPart, Part, ToolPart } from '../../../shared/types.ts'
import * as browser from '../browser.ts'
import { config, projectDir } from '../config.ts'
import { publish } from '../events.ts'
import * as git from '../git.ts'
import * as messages from '../messages.ts'
import * as projects from '../projects.ts'
import * as sandbox from '../sandbox.ts'
import { estimateTokens, fitContext } from './compact.ts'
import { projectContext } from './context.ts'
import { missingDependencies } from './fixers.ts'
import { asUser, complete, llm, userHeaders } from './llm.ts'
import { pendingLabel, progressLabel } from './progress.ts'
import { systemPrompt } from './prompt.ts'
import { type ToolContext, lint, runTool, toolSchemas, typecheck } from './tools.ts'

const MAX_FIX_ROUNDS = 2
const FULL_HISTORY_TURNS = 2

type Running = { abort: AbortController; messageId: string }
const running = new Map<string, Running>()

export const isRunning = (projectId: string) => running.has(projectId)
export const runningMessage = (projectId: string) => running.get(projectId)?.messageId

export function stop(projectId: string) {
  running.get(projectId)?.abort.abort()
}

class Stream {
  parts: Part[] = []
  private timer?: NodeJS.Timeout

  constructor(
    private projectId: string,
    private messageId: string,
  ) {}

  private persistSoon() {
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      void messages.save(this.messageId, { parts: this.parts })
    }, 1000)
  }

  add(part: Part): number {
    this.parts.push(part)
    const index = this.parts.length - 1
    publish(this.projectId, { type: 'part', messageId: this.messageId, index, part })
    this.persistSoon()
    return index
  }

  set(index: number, part: Part) {
    this.parts[index] = part
    publish(this.projectId, { type: 'part', messageId: this.messageId, index, part })
    this.persistSoon()
  }

  append(index: number, text: string) {
    const part = this.parts[index]
    if (part.type !== 'text' && part.type !== 'reasoning') return
    part.text += text
    publish(this.projectId, { type: 'delta', messageId: this.messageId, index, text })
    this.persistSoon()
  }

  upsertPlan(part: Part) {
    const existing = this.parts.findIndex((p) => p.type === 'plan')
    if (existing === -1) this.add(part)
    else this.set(existing, part)
  }

  flush() {
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

async function imageContent(projectId: string, url: string): Promise<ChatCompletionContentPart | null> {
  const name = path.basename(url)
  const file = path.join(config.dataDir, 'uploads', projectId, name)
  if (!existsSync(file)) return null
  const ext = path.extname(name).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return { type: 'image_url', image_url: { url: `data:${mime};base64,${(await readFile(file)).toString('base64')}` } }
}

function userText(parts: Part[]): string {
  const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
  const elements = parts.flatMap((p) => (p.type === 'elements' ? p.elements : []))
  if (!elements.length) return text
  const list = elements
    .map((e, i) => {
      const [file, line] = e.oid.split(':')
      return `${i + 1}. <${e.tag}> in ${file} at line ${line}${e.text ? ` — text: "${e.text.slice(0, 120)}"` : ''}${e.className ? ` — classes: "${e.className.slice(0, 200)}"` : ''}${e.note ? `\n   User note: ${e.note}` : ''}`
    })
    .join('\n')
  return `${text}\n\n<selected-elements>\nThe user selected these elements in the preview (numbered as shown to them):\n${list}\n</selected-elements>`
}

async function userContent(projectId: string, parts: Part[], extra = ''): Promise<string | ChatCompletionContentPart[]> {
  const text = userText(parts) + extra
  const images = (await Promise.all(parts.filter((p) => p.type === 'image').map((p) => imageContent(projectId, p.url)))).filter((p) => p !== null)
  return images.length ? [{ type: 'text', text }, ...images] : text
}

function compress(m: messages.StoredMessage): ChatCompletionMessageParam {
  const text = m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim()
  const files = [...new Set(m.parts.flatMap((p) => (p.type === 'tool' && typeof p.args.path === 'string' && p.name !== 'read_file' ? [p.args.path] : [])))]
  return { role: 'assistant', content: `${text || '(no reply)'}${files.length ? `\n[Files changed in this turn: ${files.join(', ')}]` : ''}` }
}

async function buildHistory(projectId: string, currentUserId: string, currentAssistantId: string): Promise<{ history: ChatCompletionMessageParam[]; current: messages.StoredMessage }> {
  const rows = await messages.list(projectId)
  const current = rows.find((r) => r.id === currentUserId)!
  const prior = rows.filter((r) => r.id !== currentAssistantId && r.id !== currentUserId)
  const assistants = prior.filter((r) => r.role === 'assistant')
  const keepFull = new Set(assistants.slice(-FULL_HISTORY_TURNS).map((r) => r.id))
  const history: ChatCompletionMessageParam[] = []
  for (const r of prior) {
    if (r.role === 'user') history.push({ role: 'user', content: userText(r.parts) || '(empty)' })
    else if (keepFull.has(r.id) && r.transcript.length) history.push(...r.transcript)
    else history.push(compress(r))
  }
  return { history, current }
}

function sanitizeTranscript(t: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  return t.map((m) => (m.role === 'user' && Array.isArray(m.content) ? { role: 'user', content: m.content.filter((c) => c.type === 'text') } : m))
}

export async function startRun(opts: { projectId: string; userMessageId: string; mode: ChatMode; model: string }) {
  if (running.has(opts.projectId)) throw new Error('A response is already in progress')
  const assistant = await messages.create(opts.projectId, 'assistant', [], { mode: opts.mode, status: 'streaming' })
  publish(opts.projectId, { type: 'message', message: messages.toMessage(assistant) })
  const abort = new AbortController()
  running.set(opts.projectId, { abort, messageId: assistant.id })
  const email = await messages.authorEmail(opts.userMessageId)
  void asUser(email, () => execute({ ...opts, assistantId: assistant.id, abort })).finally(() => running.delete(opts.projectId))
  return assistant
}

async function execute(opts: { projectId: string; userMessageId: string; assistantId: string; mode: ChatMode; model: string; abort: AbortController }) {
  const { projectId, mode, model, abort } = opts
  const stream = new Stream(projectId, opts.assistantId)
  const transcript: ChatCompletionMessageParam[] = []
  const ctx: ToolContext = { projectId, model, mode, signal: abort.signal, changed: new Set(), startedAt: Date.now(), emit: (p) => stream.add(p), update: (i, p) => stream.set(i, p) }
  const dir = projectDir(projectId)
  let status: 'done' | 'error' | 'stopped' = 'done'
  let checksPassed: boolean | null = null
  const started = Date.now()

  try {
    const { history, current } = await buildHistory(projectId, opts.userMessageId, opts.assistantId)
    const instructions = (await projects.byId(projectId))?.instructions ?? ''
    const firstTurn = !history.some((m) => m.role === 'assistant')
    void sandbox.ensure(projectId).catch(() => {})

    const elementFiles = current.parts.flatMap((p) => (p.type === 'elements' ? p.elements.map((e) => e.oid.split(':')[0]) : []))
    const contextBlock = await projectContext(projectId, userText(current.parts), elementFiles)
    const userMsg: ChatCompletionMessageParam = { role: 'user', content: await userContent(projectId, current.parts, `\n\n${contextBlock}`) }
    transcript.push(userMsg)

    const tools = toolSchemas(mode)
    let fixRounds = 0

    const system: ChatCompletionMessageParam = { role: 'system', content: systemPrompt({ mode, firstTurn, instructions, imageGeneration: Boolean(config.comfy.url) }) }
    for (let step = 0; step < config.ai.maxSteps; step++) {
      if (estimateTokens([system, ...history, ...transcript]) > config.ai.contextBudget) {
        // Compact well below the budget and keep the result, so later steps stay append-only and hit the prompt cache.
        const request = transcript[0]
        const compacted = fitContext({ system, request }, history, transcript.slice(1), Math.floor(config.ai.contextBudget * 0.6))
        const at = compacted.indexOf(request)
        history.splice(0, history.length, ...compacted.slice(1, at))
        transcript.splice(1, transcript.length - 1, ...compacted.slice(at + 1))
      }
      const result = await callModel({
        model,
        messages: [system, ...history, ...transcript],
        tools,
        stream,
        signal: abort.signal,
      })
      transcript.push(result.message)
      if (!result.toolCalls.length) {
        if (mode === 'plan' || !ctx.changed.size) break
        const check = await postTurnChecks(projectId, ctx, stream, abort.signal)
        checksPassed = check.ok
        if (check.ok || fixRounds >= MAX_FIX_ROUNDS) break
        fixRounds++
        transcript.push({ role: 'user', content: `Automated check found problems in the app. Fix them now, then give a one-sentence summary.\n\n${check.report}` })
        continue
      }
      let endTurn = false
      const images: ChatCompletionContentPart[] = []
      for (const call of result.toolCalls) {
        const index = result.toolParts.get(call.id)!
        const { label, args, result: out } = await runTool(call.function.name, call.function.arguments, ctx)
        const part = stream.parts[index] as ToolPart
        stream.set(index, { ...part, label, args: summarizeArgs(args), status: out.error ? 'error' : 'done', result: out.output.slice(0, 4000), summary: out.summary })
        if (out.part?.type === 'plan') stream.upsertPlan(out.part)
        else if (out.part) stream.add(out.part)
        if (ctx.changed.size) publish(projectId, { type: 'files', paths: [...ctx.changed] })
        transcript.push({ role: 'tool', tool_call_id: call.id, content: out.output })
        if (out.image) images.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(out.image).toString('base64')}` } })
        if (out.endTurn) endTurn = true
      }
      if (images.length) transcript.push({ role: 'user', content: [{ type: 'text', text: 'Screenshot(s) requested by the screenshot tool:' }, ...images] })
      if (endTurn) break
      if (step === config.ai.maxSteps - 1) {
        if (ctx.changed.size) checksPassed = (await postTurnChecks(projectId, ctx, stream, abort.signal)).ok
        stream.add({ type: 'paused', steps: config.ai.maxSteps })
      }
    }
  } catch (err) {
    if (abort.signal.aborted) status = 'stopped'
    else {
      status = 'error'
      console.error('[agent]', err)
      stream.add({ type: 'error', message: friendlyError(err) })
    }
  }

  stream.parts.forEach((p, i) => {
    if (p.type === 'tool' && p.status === 'running') stream.set(i, { ...p, status: 'error', result: 'Interrupted' })
  })

  let commitSha: string | null = null
  try {
    if (mode === 'build') {
      const title = (await messages.get(opts.userMessageId))?.parts.find((p) => p.type === 'text')?.text.split('\n')[0].slice(0, 72) || 'Update'
      const before = await git.head(dir)
      commitSha = await git.commitAll(dir, title)
      if (commitSha) {
        stream.add({ type: 'version', sha: commitSha, title, files: await git.changedFiles(dir, before, commitSha) })
        if (checksPassed !== false && status === 'done') publish(projectId, { type: 'project', project: await projects.update(projectId, { lastGoodCommit: commitSha }) })
        publish(projectId, { type: 'versions' })
      }
    }
  } catch (err) {
    console.error('[agent] commit failed', err)
  }

  if (mode === 'build' && commitSha && !(await messages.list(projectId)).some((m) => m.role === 'assistant' && m.commitSha && m.id !== opts.assistantId)) {
    const summary = stream.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    void nameProject(projectId, `${(await messages.get(opts.userMessageId))?.parts.find((p) => p.type === 'text')?.text ?? ''}\n\nWhat was built:\n${summary}`)
  }

  if (mode === 'build' && status === 'done' && commitSha) {
    const items = await suggestions(stream.parts).catch(() => [])
    if (items.length) stream.add({ type: 'suggestions', items })
  }

  stream.flush()
  await messages.save(opts.assistantId, { parts: stream.parts, transcript: sanitizeTranscript(transcript.slice(1)), status, commitSha, durationMs: Date.now() - started })
  publish(projectId, { type: 'status', messageId: opts.assistantId, status })
}

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' && v.length > 2000 ? `${v.slice(0, 2000)}…` : v
  return out
}

function friendlyError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err)
  if (/502|503|Bad Gateway|ECONNREFUSED|fetch failed/i.test(msg)) return 'The AI model is temporarily unavailable. Please try again in a moment, or switch model.'
  return msg.slice(0, 500)
}

async function callModel(opts: {
  model: string
  messages: ChatCompletionMessageParam[]
  tools: ReturnType<typeof toolSchemas>
  stream: Stream
  signal: AbortSignal
}) {
  const { stream } = opts
  const started = Date.now()
  let firstToken = 0
  let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } | null } | undefined
  const completion = await llm.chat.completions.create(
    { model: opts.model, messages: opts.messages, tools: opts.tools, stream: true, stream_options: { include_usage: true }, max_tokens: 32_000, parallel_tool_calls: true, ...(config.ai.reasoningEffort ? { reasoning_effort: config.ai.reasoningEffort } : {}) },
    { signal: opts.signal, headers: userHeaders() },
  )
  let text = ''
  let textIndex = -1
  let reasoningIndex = -1
  let reasoningStart = 0
  const calls = new Map<number, { id: string; name: string; args: string; shownAt: number }>()
  const toolParts = new Map<string, number>()

  const endReasoning = () => {
    if (reasoningIndex === -1) return
    const part = stream.parts[reasoningIndex]
    if (part.type === 'reasoning' && part.durationMs === undefined) stream.set(reasoningIndex, { ...part, durationMs: Date.now() - reasoningStart })
  }

  for await (const chunk of completion) {
    if (chunk.usage) usage = chunk.usage
    firstToken ||= Date.now()
    const delta = chunk.choices[0]?.delta as ({ reasoning_content?: string; reasoning?: string } & NonNullable<(typeof chunk.choices)[number]['delta']>) | undefined
    if (!delta) continue
    const reasoning = delta.reasoning_content ?? delta.reasoning
    if (reasoning) {
      if (reasoningIndex === -1) {
        reasoningStart = Date.now()
        reasoningIndex = stream.add({ type: 'reasoning', text: '' })
      }
      stream.append(reasoningIndex, reasoning)
    }
    if (delta.content) {
      endReasoning()
      if (textIndex === -1) {
        if (!delta.content.trim() && !text) continue
        textIndex = stream.add({ type: 'text', text: '' })
      }
      text += delta.content
      stream.append(textIndex, delta.content)
    }
    for (const tc of delta.tool_calls ?? []) {
      endReasoning()
      const entry = calls.get(tc.index) ?? { id: '', name: '', args: '', shownAt: 0 }
      if (tc.id && !entry.id) entry.id = tc.id
      if (tc.function?.name) entry.name += tc.function.name
      if (tc.function?.arguments) entry.args += tc.function.arguments
      calls.set(tc.index, entry)
      if (!entry.name) continue
      entry.id ||= `call_${Date.now()}_${tc.index}`
      const label = progressLabel(entry.name, entry.args)
      const index = toolParts.get(entry.id)
      if (index === undefined) {
        toolParts.set(entry.id, stream.add({ type: 'tool', id: entry.id, name: entry.name, label, status: 'running', args: {} }))
      } else if (Date.now() - entry.shownAt > 400) {
        const part = stream.parts[index]
        if (part.type === 'tool' && part.label !== label) stream.set(index, { ...part, name: entry.name, label })
      } else continue
      entry.shownAt = Date.now()
    }
  }
  endReasoning()
  console.log(
    `[llm] ${opts.model} prompt=${usage?.prompt_tokens ?? '?'} cached=${usage?.prompt_tokens_details?.cached_tokens ?? '?'} out=${usage?.completion_tokens ?? '?'} ttft=${firstToken - started}ms total=${Date.now() - started}ms calls=${calls.size}`,
  )

  const toolCalls: ChatCompletionMessageFunctionToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, c]) => ({ id: c.id || `call_${Date.now()}_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }))

  for (const call of toolCalls) {
    if (!toolParts.has(call.id)) toolParts.set(call.id, stream.add({ type: 'tool', id: call.id, name: call.function.name, label: pendingLabel(call.function.name), status: 'running', args: {} }))
  }

  const message: ChatCompletionMessageParam = toolCalls.length ? { role: 'assistant', content: text || null, tool_calls: toolCalls } : { role: 'assistant', content: text }
  return { message, toolCalls, toolParts }
}

async function postTurnChecks(projectId: string, ctx: ToolContext, stream: Stream, signal: AbortSignal): Promise<{ ok: boolean; report: string }> {
  const dir = projectDir(projectId)
  const index = stream.add({ type: 'check', status: 'running', label: 'Checking for errors' })
  const problems: string[] = []
  const since = Date.now()

  const missing = await missingDependencies(dir, [...ctx.changed])
  if (missing.length) {
    const res = await sandbox.execIn(projectId, `pnpm add ${missing.join(' ')}`, { timeoutMs: 300_000, signal })
    if (res.code !== 0) problems.push(`These imported packages could not be installed: ${missing.join(', ')}\n${(res.stderr || res.stdout).slice(-1500)}`)
  }

  const tsc = await typecheck(projectId, signal)
  if (!tsc.ok) problems.push(`TypeScript errors:\n${tsc.output.slice(0, 6000)}`)
  const linted = await lint(projectId, ctx.changed, signal)
  if (!linted.ok) problems.push(`Lint errors (real bugs, fix them):\n${linted.output.slice(0, 3000)}`)

  if (tsc.ok && browser.available()) {
    try {
      const shot = await browser.capture(projectId, '/')
      if (shot.errors.length) problems.push(`Problems when opening the app in a browser (scrolled through the whole page):\n${shot.errors.join('\n')}\nNote: image paths must be ES imports (import img from "@/assets/x.jpg"), never "@/..." strings.`)
      else await browser.saveThumbnail(projectId, shot.image)
    } catch (err) {
      console.warn('[agent] browser check failed', (err as Error).message)
    }
  }

  await new Promise((r) => setTimeout(r, 1500))
  const runtime = sandbox
    .logs(projectId)
    .filter((l) => l.at >= since - 15_000 && (l.level === 'error' || /error/i.test(l.message)) && !/\[vite\] (hmr|page reload)|favicon/i.test(l.message))
    .slice(-15)
  if (runtime.length) problems.push(`Errors from the dev server / preview:\n${runtime.map((l) => `${l.source}: ${l.message}`).join('\n')}`)

  const ok = problems.length === 0
  const part: CheckPart = ok
    ? { type: 'check', status: 'passed', label: 'No errors found' }
    : { type: 'check', status: 'failed', label: 'Found problems — fixing', details: problems.join('\n\n').slice(0, 4000) }
  stream.set(index, part)
  return { ok, report: problems.join('\n\n') }
}

async function nameProject(projectId: string, prompt: string) {
  try {
    const name = await complete(config.ai.defaultModel, 'You name apps. Reply with only the app\'s name: if the description names the product/brand (e.g. a cafe called "Ember & Oak"), use that name exactly; otherwise invent a short 1-3 word name. No quotes.', prompt.slice(0, 1000), 2000)
    const clean = name.replace(/["'.*#]/g, '').split('\n')[0].trim().slice(0, 40)
    if (clean) publish(projectId, { type: 'project', project: await projects.update(projectId, { name: clean }) })
  } catch {
    // keep default name
  }
}

async function suggestions(parts: Part[]): Promise<string[]> {
  const summary = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').slice(-3000)
  if (!summary.trim()) return []
  const out = await Promise.race([
    complete(
      config.ai.defaultModel,
      'Suggest exactly 3 short next steps (max 6 words each) the user could ask an AI app builder to do next for this app, written as imperative requests a non-technical person would make (e.g. "Add a contact form"). One per line, no numbering, no quotes.',
      summary,
      1500,
    ),
    new Promise<string>((r) => setTimeout(() => r(''), 20_000)),
  ])
  return out
    .split('\n')
    .map((l) => l.replace(/^[-*\d.\s"]+|"$/g, '').trim())
    .filter((l) => l && l.length <= 60)
    .slice(0, 3)
}
