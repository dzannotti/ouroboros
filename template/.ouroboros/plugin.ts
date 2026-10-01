import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { Plugin } from 'vite'

const BRIDGE_ID = '/@ouroboros/bridge'
const bridgeFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bridge.ts')

type Node = { type: string; start?: number | null; end?: number | null; loc?: { start: { line: number; column: number } } | null; [key: string]: unknown }

function walk(node: unknown, visit: (node: Node) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  const n = node as Node
  if (typeof n.type === 'string') visit(n)
  for (const key in n) {
    if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments') walk(n[key], visit)
  }
}

function elementName(name: Node): string {
  if (name.type === 'JSXIdentifier') return name.name as string
  if (name.type === 'JSXMemberExpression') return `${elementName(name.object as Node)}.${elementName(name.property as Node)}`
  return ''
}

export function tagJsx(code: string, file: string): string | null {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true })
  const s = new MagicString(code)
  walk(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement' || !node.loc) return
    const name = elementName(node.name as Node)
    if (!name || name === 'Fragment' || name.endsWith('.Fragment')) return
    const attrs = node.attributes as Node[]
    if (attrs.some((a) => a.type === 'JSXAttribute' && (a.name as Node).name === 'data-oid')) return
    const { line, column } = node.loc.start
    s.appendLeft((node.name as Node).end as number, ` data-oid="${file}:${line}:${column + 1}"`)
  })
  return s.hasChanged() ? s.toString() : null
}

export function ouroboros(): Plugin {
  let root = process.cwd()
  let base = '/'
  return {
    name: 'ouroboros',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      base = config.base
    },
    resolveId(id) {
      if (id === BRIDGE_ID) return bridgeFile
    },
    transform(code, id) {
      const file = path.relative(root, id.split('?')[0])
      if (!/\.(t|j)sx$/.test(file) || file.startsWith('..') || file.includes('node_modules') || file.startsWith('src/components/ui/')) return
      const tagged = tagJsx(code, file)
      return tagged ? { code: tagged, map: null } : undefined
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: `${base.replace(/\/$/, '')}${BRIDGE_ID}` }, injectTo: 'head-prepend' }]
    },
  }
}
