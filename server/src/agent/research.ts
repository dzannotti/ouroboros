import * as browser from '../browser.ts'
import { complete } from './llm.ts'
import { fetchText, searchWeb } from './tools.ts'

type Learning = { text: string; url: string }
type Query = { query: string; goal: string }

const PAGE_CHARS = 20_000
const MAX_SEARCHES = 20
const MAX_LEARNINGS = 120

const today = () => new Date().toISOString().slice(0, 10)

const PLAN = `You plan web searches for a research question. Today is {{DATE}}.
Return at most {{N}} search queries, fewer if the question is narrow. Each query must be unique and cover a different angle; plain search phrases only, no site:, quotes, OR/AND or other operators. For each, give the research goal: what this query should establish and where to dig next once results are in.
Reply with JSON only: {"queries":[{"query":"...","goal":"..."}]}`

const EXTRACT = `You extract learnings from web pages for a research goal. Today is {{DATE}}.
Return at most 6 learnings, each concise but information dense, with the exact entities (products, companies, people, versions), numbers, prices and dates the pages give. Each learning cites the URL of the page it came from. Only state what the pages say; skip anything the pages don't support, marketing fluff, and pages about a different product or topic than the goal (name the product a learning is about when that could be ambiguous).
Also return at most {{N}} follow-up questions that would fill the most important gaps left.
Reply with JSON only: {"learnings":[{"text":"...","url":"..."}],"followUps":["..."]}`

const REPORT = `You write the final research report from numbered learnings. Today is {{DATE}}.
- Synthesize, don't summarize: answer the question directly first, then organize by theme, not by source. Note where sources disagree or evidence is thin.
- Every substantive claim carries an in-text citation like [3] using the learning numbers given. Cite only those numbers; never invent sources or facts that are not in the learnings.
- Markdown with ## headings, tables where they help. Be as long as the material deserves and no longer.
- End with a ## Sources section listing each cited number as "[n] URL".`

function json<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/)
  try {
    return m ? (JSON.parse(m[0]) as T) : null
  } catch {
    return null
  }
}

async function readPage(url: string, signal: AbortSignal): Promise<string> {
  const page = await fetchText(url, signal).catch(() => ({ status: 0, body: '' }))
  if (page.status === 200 && page.body.length > 500) return page.body
  return browser.available() ? browser.renderedText(url).catch(() => page.body) : page.body
}

export async function deepResearch(question: string, opts: { model: string; breadth: number; depth: number; signal: AbortSignal; progress: (s: string) => void }) {
  const learnings: Learning[] = []
  const visited = new Set<string>()
  let searches = 0
  const date = today()

  const plan = async (prompt: string, n: number) => {
    const known = learnings.length ? `\n\nLearnings so far (search for what they leave open, not for these again):\n${learnings.map((l) => `- ${l.text}`).join('\n')}` : ''
    const out = json<{ queries?: Query[] }>(await complete(opts.model, PLAN.replace('{{DATE}}', date).replace('{{N}}', String(n)), `${prompt}${known}`, 2000, 'low'))
    return (out?.queries ?? []).filter((q) => q?.query).slice(0, n)
  }

  const investigate = async (q: Query, followUps: number) => {
    if (searches >= MAX_SEARCHES || opts.signal.aborted) return []
    searches++
    opts.progress(`Researching: ${q.query.slice(0, 60)}`)
    const results = (await searchWeb(q.query, opts.signal).catch(() => ({ results: [] }))).results ?? []
    const urls = results.map((r) => r.url).filter((u): u is string => Boolean(u) && !visited.has(u!)).slice(0, 3)
    urls.forEach((u) => visited.add(u))
    const pages = (await Promise.all(urls.map(async (u) => ({ url: u, text: (await readPage(u, opts.signal)).slice(0, PAGE_CHARS) })))).filter((p) => p.text.length > 200)
    if (!pages.length) return []
    const body = `Research goal: ${q.goal}\nQuery: ${q.query}\n\n${pages.map((p) => `<page url="${p.url}">\n${p.text}\n</page>`).join('\n\n')}`
    const out = json<{ learnings?: Learning[]; followUps?: string[] }>(await complete(opts.model, EXTRACT.replace('{{DATE}}', date).replace('{{N}}', String(followUps)), body, 4000, 'low'))
    const fresh = (out?.learnings ?? []).filter((l) => l?.text && l.url && !learnings.some((x) => x.text === l.text))
    learnings.push(...fresh.slice(0, MAX_LEARNINGS - learnings.length))
    return fresh.length ? (out?.followUps ?? []).filter(Boolean).map((f) => `Previous research goal: ${q.goal}\nFollow-up research directions: ${f}`) : []
  }

  const recurse = async (prompt: string, breadth: number, depth: number): Promise<void> => {
    const queries = await plan(prompt, breadth)
    const next = Math.max(1, Math.ceil(breadth / 2))
    const followUps = (await Promise.all(queries.map((q) => investigate(q, next)))).flat()
    if (depth > 1) await Promise.all(followUps.slice(0, breadth).map((f) => recurse(f, next, depth - 1)))
  }

  opts.progress('Planning research')
  await recurse(question, opts.breadth, opts.depth)
  if (!learnings.length) return { report: '', sources: [] as string[], searches }
  opts.progress(`Writing report from ${learnings.length} findings`)
  const sources = [...new Set(learnings.map((l) => l.url))]
  const numbered = learnings.map((l) => `[${sources.indexOf(l.url) + 1}] ${l.text}`).join('\n')
  const report = await complete(opts.model, REPORT.replace('{{DATE}}', date), `Question: ${question}\n\nLearnings (number = source):\n${numbered}\n\nSources:\n${sources.map((u, i) => `[${i + 1}] ${u}`).join('\n')}`, 16_000, 'medium').catch(() => '')
  return { report: report || `The report could not be written; these are the findings it would have used.\n\n${numbered}\n\n## Sources\n${sources.map((u, i) => `[${i + 1}] ${u}`).join('\n')}`, sources, searches }
}
