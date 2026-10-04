import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findBlock, formatResults } from './tools.ts'

const file = `function a() {\n  return 1\n}\n\nfunction b() {\n    return 2\n}\n`

test('findBlock exact match', () => {
  const hit = findBlock(file, 'return 1')
  assert.equal(hit.count, 1)
  assert.equal(file.slice(hit.index, hit.index + hit.length), 'return 1')
})

test('findBlock tolerates indentation differences', () => {
  const hit = findBlock(file, 'function b() {\n  return 2\n}')
  assert.equal(hit.count, 1)
  assert.equal(file.slice(hit.index, hit.index + hit.length), 'function b() {\n    return 2\n}')
})

test('findBlock reports ambiguity and misses', () => {
  assert.equal(findBlock(file, 'return').count, 2)
  assert.equal(findBlock(file, 'nope').index, -1)
})

test('formatResults numbers unique results and trims snippets', () => {
  const out = formatResults({ results: [
    { title: 'Sonner - shadcn/ui', url: 'https://ui.shadcn.com/docs/sonner', content: '  An opinionated\ntoast component  ' },
    { title: 'dupe', url: 'https://ui.shadcn.com/docs/sonner' },
    { url: 'https://example.com/x' },
  ] })
  assert.equal(out, '1. Sonner - shadcn/ui\n   https://ui.shadcn.com/docs/sonner\n   An opinionated toast component\n2. https://example.com/x\n   https://example.com/x')
  assert.equal(formatResults({ results: [] }), 'No results.')
})
