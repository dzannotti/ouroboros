import assert from 'node:assert/strict'
import { test } from 'node:test'
import { open, seal } from './secret.ts'

test('seal and open round-trip, and tampering is detected', () => {
  const sealed = seal('vcp_example-token')
  assert.notEqual(sealed, seal('vcp_example-token'))
  assert.equal(open(sealed), 'vcp_example-token')
  const parts = sealed.split('.')
  parts[3] = Buffer.from('tampered').toString('base64url')
  assert.throws(() => open(parts.join('.')))
})

test('Vercel project names are slugged, bounded and unique per project', async () => {
  const { projectName } = await import('./vercel.ts')
  assert.equal(projectName('Marigold Café!', 'u1hczq05ih'), 'marigold-caf-u1hczq')
  assert.equal(projectName('***', 'abcdef1234'), 'app-abcdef')
  assert.ok(projectName('x'.repeat(200), 'abcdef1234').length <= 87)
})
