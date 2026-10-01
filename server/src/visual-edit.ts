import { readFile, writeFile } from 'node:fs/promises'
import { parse } from '@babel/parser'
import { HTTPException } from 'hono/http-exception'
import MagicString from 'magic-string'
import { type StyleChanges, applyStyles } from '../../shared/styles.ts'
import { safePath } from './projects.ts'

type Node = { type: string; start: number; end: number; loc: { start: { line: number; column: number } }; [key: string]: unknown }

export type TextSegment = { id: number; value: string }
export type ElementInfo = { file: string; texts: TextSegment[]; className: string | null; dynamicClass: boolean }

function find(node: unknown, line: number, column: number): Node | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, line, column)
      if (hit) return hit
    }
    return null
  }
  const n = node as Node
  if (n.type === 'JSXElement') {
    const open = n.openingElement as Node
    if (open.loc.start.line === line && open.loc.start.column + 1 === column) return n
  }
  for (const key in n) {
    if (key === 'loc') continue
    const hit = find(n[key], line, column)
    if (hit) return hit
  }
  return null
}

async function locate(projectId: string, oid: string) {
  const m = /^(.+):(\d+):(\d+)$/.exec(oid)
  if (!m) throw new HTTPException(400, { message: 'Invalid element id' })
  const [, file, line, column] = m
  const full = safePath(projectId, file)
  const code = await readFile(full, 'utf8')
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  const element = find(ast.program, Number(line), Number(column))
  if (!element) throw new HTTPException(409, { message: 'Element not found — the file changed. Reload the preview and try again.' })
  return { file, full, code, element }
}

function stringsIn(expr: Node, out: Node[]) {
  if (expr.type === 'StringLiteral') out.push(expr)
  else if (expr.type === 'TemplateLiteral' && (expr.expressions as Node[]).length === 0) out.push(expr)
  else if (expr.type === 'ConditionalExpression') {
    stringsIn(expr.consequent as Node, out)
    stringsIn(expr.alternate as Node, out)
  } else if (expr.type === 'LogicalExpression') stringsIn(expr.right as Node, out)
}

function textNodes(element: Node): Node[] {
  const out: Node[] = []
  for (const child of element.children as Node[]) {
    if (child.type === 'JSXText' && (child.value as string).trim()) out.push(child)
    else if (child.type === 'JSXExpressionContainer') stringsIn(child.expression as Node, out)
  }
  return out
}

const valueOf = (n: Node, code: string) =>
  n.type === 'JSXText' ? (n.value as string).trim() : n.type === 'StringLiteral' ? (n.value as string) : code.slice(n.start + 1, n.end - 1)

const classAttr = (element: Node) => ((element.openingElement as Node).attributes as Node[]).find((a) => a.type === 'JSXAttribute' && (a.name as Node).name === 'className')

export async function inspect(projectId: string, oid: string): Promise<ElementInfo> {
  const { file, code, element } = await locate(projectId, oid)
  const attr = classAttr(element)
  const value = attr?.value as Node | null | undefined
  return {
    file,
    texts: textNodes(element).map((n) => ({ id: n.start, value: valueOf(n, code) })),
    className: value?.type === 'StringLiteral' ? (value.value as string) : attr ? null : '',
    dynamicClass: Boolean(value && value.type !== 'StringLiteral'),
  }
}

function replacement(n: Node, original: string, next: string) {
  if (n.type === 'JSXText') {
    const lead = /^\s*/.exec(original)![0]
    const trail = /\s*$/.exec(original)![0]
    return lead + (/[{}<>]/.test(next) ? `{${JSON.stringify(next)}}` : next) + trail
  }
  return JSON.stringify(next)
}

export async function visualEdit(projectId: string, oid: string, change: { texts?: TextSegment[]; styles?: StyleChanges }) {
  const { file, full, code, element } = await locate(projectId, oid)
  const s = new MagicString(code)
  const open = element.openingElement as Node

  if (change.styles && Object.keys(change.styles).length) {
    const attr = classAttr(element)
    const v = attr?.value as Node | null | undefined
    if (v && v.type !== 'StringLiteral') throw new HTTPException(422, { message: 'This element has dynamic styles — ask the AI to change it instead.' })
    const next = applyStyles(v ? (v.value as string) : '', change.styles)
    if (attr) s.overwrite(attr.start, attr.end, next ? `className=${JSON.stringify(next)}` : '')
    else if (next) s.appendLeft((open.name as Node).end, ` className=${JSON.stringify(next)}`)
  }

  if (change.texts?.length) {
    const nodes = textNodes(element)
    for (const t of change.texts) {
      const node = nodes.find((n) => n.start === t.id)
      if (!node) throw new HTTPException(409, { message: 'The text changed since you selected it. Reload the preview and try again.' })
      if (valueOf(node, code) === t.value) continue
      s.overwrite(node.start, node.end, replacement(node, code.slice(node.start, node.end), t.value))
    }
  }

  if (!s.hasChanged()) return { file, changed: false }
  await writeFile(full, s.toString())
  return { file, changed: true }
}
