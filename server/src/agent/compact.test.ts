import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { estimateTokens, fitContext } from './compact.ts'

type Msg = ChatCompletionMessageParam
const big = (n: number) => 'x'.repeat(n)
const system: Msg = { role: 'system', content: 'sys' }
const request: Msg = { role: 'user', content: 'build it' }

function step(i: number, size: number): Msg[] {
  return [
    { role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: `f${i}.tsx`, content: big(size) }) } }] },
    { role: 'tool', tool_call_id: `c${i}`, content: big(size) },
  ]
}

test('returns everything untouched when under budget', () => {
  const turn = step(1, 100)
  assert.deepEqual(fitContext({ system, request }, [], turn, 10_000), [system, request, ...turn])
})

test('compacts old tool outputs and call args, keeping pairs valid and recent steps intact', () => {
  const turn = Array.from({ length: 20 }, (_, i) => step(i, 20_000)).flat()
  const out = fitContext({ system, request }, [], turn, 60_000)
  assert.ok(estimateTokens(out) <= 60_000)
  assert.equal(out.length, turn.length + 2)
  const tools = out.filter((m) => m.role === 'tool')
  assert.match(String(tools[0].content), /omitted/)
  assert.equal(String(tools.at(-1)!.content).length, 20_000)
  const firstCall = out.find((m) => m.role === 'assistant')!
  assert.ok(firstCall.role === 'assistant' && firstCall.tool_calls)
  const call = firstCall.tool_calls![0]
  assert.ok(call.type === 'function')
  assert.equal(JSON.parse(call.function.arguments).path, 'f0.tsx')
  assert.match(JSON.parse(call.function.arguments).content, /omitted/)
})

test('drops oldest history turns at user boundaries when still too big', () => {
  const history: Msg[] = [
    { role: 'user', content: big(40_000) },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'a2' },
  ]
  const out = fitContext({ system, request }, history, [], 5_000)
  assert.deepEqual(out, [system, { role: 'user', content: 'second' }, { role: 'assistant', content: 'a2' }, request])
})
