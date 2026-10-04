import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { config } from '../config.ts'
import { asUser, billImage, userHeaders } from './llm.ts'

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

test('billImage bills the megapixels drawn to the user behind the turn', async () => {
  const seen: { user?: string; body: unknown }[] = []
  const gateway = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      seen.push({ user: req.headers['x-user-email'] as string | undefined, body: JSON.parse(body) })
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}')
    })
  }).listen(0)
  const saved = { baseUrl: config.ai.baseUrl, userHeader: config.ai.userHeader }
  try {
    config.ai.baseUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
    config.ai.userHeader = 'X-User-Email'
    await billImage(1024, 768, '')
    await asUser('ada@example.com', () => billImage(1024, 768, 'z-image-turbo'))
    assert.deepEqual(seen, [{ user: 'ada@example.com', body: { model: 'z-image-turbo', prompt: 'z-image-turbo', metadata: { units: 0.786432 } } }])
  } finally {
    Object.assign(config.ai, saved)
    gateway.close()
  }
})
