import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.ts'

/** Key for credentials at rest: derived from SESSION_SECRET, or a key file kept in the data dir. */
function loadKey(): Buffer {
  if (config.auth.sessionSecret) return createHash('sha256').update(`ouroboros-credentials:${config.auth.sessionSecret}`).digest()
  const file = path.join(config.dataDir, 'credentials-key')
  if (!existsSync(file)) {
    mkdirSync(config.dataDir, { recursive: true })
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return createHash('sha256').update(readFileSync(file, 'utf8').trim()).digest()
}

let key: Buffer | undefined

export function seal(plain: string): string {
  key ??= loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function open(sealed: string): string {
  key ??= loadKey()
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable stored credential')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
