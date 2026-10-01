import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asUser, userHeaders } from './llm.ts'

test('userHeaders names the user behind the current turn', async () => {
  assert.deepEqual(userHeaders('X-User-Email'), {})
  await asUser('ada@example.com', async () => {
    await new Promise((r) => setTimeout(r, 1))
    assert.deepEqual(userHeaders('X-User-Email'), { 'X-User-Email': 'ada@example.com' })
    assert.deepEqual(userHeaders(undefined), {})
  })
  asUser(null, () => assert.deepEqual(userHeaders('X-User-Email'), {}))
  asUser('bad\r\nvalue', () => assert.deepEqual(userHeaders('X-User-Email'), {}))
})
