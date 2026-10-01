import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

type Msg = ChatCompletionMessageParam

const LEVELS: [number, number][] = [
  [8, 4],
  [4, 2],
  [2, 1],
  [1, 0],
]
const IMAGE_TOKENS = 1500
const LONG_ARGS = ['content', 'new_string', 'old_string', 'sql']

export function estimateTokens(messages: Msg[]): number {
  let chars = 0
  let images = 0
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'image_url') images++
        else if (part.type === 'text') chars += part.text.length
      }
    } else if (typeof m.content === 'string') chars += m.content.length
    if (m.role === 'assistant' && m.tool_calls) for (const c of m.tool_calls) if (c.type === 'function') chars += c.function.arguments.length + c.function.name.length
    chars += 16
  }
  return Math.ceil(chars / 3.5) + images * IMAGE_TOKENS
}

const omitted = (text: string) => `${text.slice(0, 200)}\n[Older tool output omitted to save context — run the tool again if you need it.]`

function shrinkArgs(args: string): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    let changed = false
    for (const key of LONG_ARGS) {
      if (typeof parsed[key] === 'string' && (parsed[key] as string).length > 300) {
        parsed[key] = '[omitted to save context]'
        changed = true
      }
    }
    return changed ? JSON.stringify(parsed) : args
  } catch {
    return args.length > 600 ? '{}' : args
  }
}

const hasImage = (m: Msg) => m.role === 'user' && Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')

/**
 * Shrinks a conversation to fit the token budget. `fixed` (system prompt + current request) is never touched;
 * `history` (earlier turns) and `turn` (this turn's steps) are compacted oldest-first, keeping tool call/result pairs valid.
 */
export function fitContext(fixed: { system: Msg; request: Msg }, history: Msg[], turn: Msg[], budget: number): Msg[] {
  const assemble = (h: Msg[], t: Msg[]) => [fixed.system, ...h, fixed.request, ...t]
  let h = [...history]
  let t = [...turn]
  if (estimateTokens(assemble(h, t)) <= budget) return assemble(h, t)

  const all = () => [...h, ...t]
  const replace = (fn: (m: Msg, index: number, list: Msg[]) => Msg) => {
    const list = all().map(fn)
    h = list.slice(0, h.length)
    t = list.slice(h.length)
  }

  for (const [keepOutputs, keepCalls] of LEVELS) {
    const toolIdx = all().flatMap((m, i) => (m.role === 'tool' ? [i] : []))
    const keepTools = new Set(toolIdx.slice(toolIdx.length - keepOutputs))
    replace((m, i) => (m.role === 'tool' && !keepTools.has(i) && typeof m.content === 'string' && m.content.length > 400 ? { ...m, content: omitted(m.content) } : m))
    if (estimateTokens(assemble(h, t)) <= budget) return assemble(h, t)

    const callIdx = all().flatMap((m, i) => (m.role === 'assistant' && m.tool_calls?.length ? [i] : []))
    const keep = new Set(callIdx.slice(callIdx.length - keepCalls))
    replace((m, i) =>
      m.role === 'assistant' && m.tool_calls && !keep.has(i)
        ? { ...m, tool_calls: m.tool_calls.map((c) => (c.type === 'function' ? { ...c, function: { ...c.function, arguments: shrinkArgs(c.function.arguments) } } : c)) }
        : m,
    )
    if (estimateTokens(assemble(h, t)) <= budget) return assemble(h, t)
  }

  const lastImage = all().findLastIndex(hasImage)
  replace((m, i) =>
    hasImage(m) && i !== lastImage && Array.isArray(m.content)
      ? { ...m, content: m.content.map((p) => (p.type === 'image_url' ? { type: 'text' as const, text: '[image omitted to save context]' } : p)) } as Msg
      : m,
  )

  while (h.length && estimateTokens(assemble(h, t)) > budget) {
    let cut = 1
    while (cut < h.length && h[cut].role !== 'user') cut++
    h = h.slice(cut)
  }
  return assemble(h, t)
}
