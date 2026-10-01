import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type RoleOptions, roleFromClaims, sign, unsign } from './auth.ts'

const opts: RoleOptions = { roleClaim: 'ouroboros_role', adminGroup: 'svc-ouroboros-admin', userGroup: 'svc-ouroboros-user', defaultRole: 'none' }

test('roleFromClaims prefers the custom role claim', () => {
  assert.equal(roleFromClaims({ ouroboros_role: 'admin', groups: [] }, opts), 'admin')
  assert.equal(roleFromClaims({ ouroboros_role: 'none', groups: ['svc-ouroboros-admin'] }, opts), null)
})

test('roleFromClaims falls back to groups (array or pipe-separated header)', () => {
  assert.equal(roleFromClaims({ groups: ['staff', 'svc-ouroboros-user'] }, opts), 'user')
  assert.equal(roleFromClaims({ groups: 'svc-ouroboros-admin|staff-admin' }, opts), 'admin')
})

test('roleFromClaims denies by default and honours defaultRole', () => {
  assert.equal(roleFromClaims({ groups: ['staff'] }, opts), null)
  assert.equal(roleFromClaims({}, { ...opts, defaultRole: 'user' }), 'user')
})

test('signed cookies round-trip and reject tampering', () => {
  const s = sign('session-123')
  assert.equal(unsign(s), 'session-123')
  assert.equal(unsign(`${s}x`), null)
  assert.equal(unsign('session-123.forged'), null)
  assert.equal(unsign(undefined), null)
})
