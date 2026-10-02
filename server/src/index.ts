import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import * as agent from './agent/run.ts'
import api from './api.ts'
import { authRoutes, startSessionCleanup } from './auth.ts'
import { config, loadModels, startModelRefresh } from './config.ts'
import { connect } from './db.ts'
import { ensureDatabase } from './infra/postgres.ts'
import { cli, ensureImage, sharedNetwork } from './infra/runtime.ts'
import { markInterrupted } from './messages.ts'
import { startPreviewGateway } from './preview.ts'
import * as backend from './backend.ts'
import { startReaper } from './sandbox.ts'

console.log(`[ouroboros] auth mode: ${config.auth.mode}, containers: ${cli}${sharedNetwork ? ` on network ${sharedNetwork}` : ' (published ports)'}`)
if (!config.ai.apiKey) console.warn('[ouroboros] AI_API_KEY is not set — model calls will likely fail')
await loadModels()
startModelRefresh()

await connect(await ensureDatabase(), config.databaseReadOnly)
if (config.databaseReadOnly) console.warn('[ouroboros] DB_READONLY: database is read-only (debugging) — writes will fail')
else await markInterrupted()
await ensureImage(config.sandboxImage, path.join(config.root, 'sandbox/Containerfile'), config.root)

const app = new Hono()
app.route('/auth', authRoutes)
app.route('/api', api)
app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)))
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message || 'Error' }, err.status)
  console.error('[ouroboros]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

if (existsSync(config.webDist)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), config.webDist) }))
  app.get('/assets/*', (c) => c.text('Not found', 404))
  app.get('*', async (c) => c.html(await readFile(path.join(config.webDist, 'index.html'), 'utf8')))
}

startReaper(agent.isRunning)
if (!config.databaseReadOnly) startSessionCleanup()
backend.startReaper(agent.isRunning)
startPreviewGateway()
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ouroboros] app on http://0.0.0.0:${info.port}, previews on :${config.previewPort}`)
})
