import { existsSync } from 'node:fs'
import http from 'node:http'
import { createProxyServer } from 'http-proxy-3'
import { config, projectDir } from './config.ts'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as backend from './backend.ts'
import { versionDist } from './version-preview.ts'
import * as sandbox from './sandbox.ts'

const proxy = createProxyServer({ xfwd: true })
proxy.on('error', (err) => console.warn('[preview] proxy error:', err.message))

const match = (url = '') => /^\/p\/([a-z0-9]{6,32})(\/|$|\?)/.exec(url)?.[1]
const BACKEND = /^\/b\/([a-z0-9]{6,32})\/(auth|rest|storage|functions)\/v1(\/[^?]*)?(\?.*)?$/

async function backendTarget(req: http.IncomingMessage) {
  const m = BACKEND.exec(req.url ?? '')
  if (!m) return null
  const [, id, service, rest = '/', query = ''] = m
  if (!existsSync(projectDir(id)) || !(await backend.isEnabled(id))) return { error: 404 as const }
  await backend.ensure(id)
  backend.touch(id)
  req.url = `${rest}${query}`
  const target = backend.url(id, service as backend.Service)
  if (!target) return { error: 404 as const }
  return { target }
}

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;font:14px/1.5 ui-sans-serif,system-ui;background:#fafafa;color:#171717}main{max-width:560px;padding:24px}pre{white-space:pre-wrap;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;padding:12px;font-size:12px;max-height:50vh;overflow:auto}</style>
</head><body><main>${body}</main></body></html>`

const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

async function target(id: string) {
  await sandbox.ensure(id)
  sandbox.touch(id)
  const url = sandbox.url(id)
  if (!url) throw new Error('Preview sandbox is not reachable')
  return url
}

export function startPreviewGateway() {
  const server = http.createServer(async (req, res) => {
    const version = /^\/v\/([a-z0-9]{6,32})\/([0-9a-f]{40})(\/[^?]*)?/.exec(req.url ?? '')
    if (version) {
      const [, id, sha, rest = '/'] = version
      const root = versionDist(id, sha)
      const file = path.resolve(root, `.${decodeURIComponent(rest)}`)
      const target = file.startsWith(root) && existsSync(file) && !file.endsWith(path.sep) && path.extname(file) ? file : path.join(root, 'index.html')
      if (!existsSync(target)) return void res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not built', '<h1>This version is not built yet</h1>'))
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' }
      res.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600' }).end(await readFile(target))
      return
    }
    if (req.url?.startsWith('/b/')) {
      try {
        const t = await backendTarget(req)
        if (!t || 'error' in t) return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Backend not found"}')
        proxy.web(req, res, { target: t.target }, (err) => {
          if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }))
        })
      } catch (err) {
        res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (err as Error).message }))
      }
      return
    }
    const id = match(req.url)
    if (!id || !existsSync(projectDir(id))) {
      res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not found', '<h1>Preview not found</h1>'))
      return
    }
    if (req.url === `/p/${id}`) {
      res.writeHead(302, { location: `/p/${id}/` }).end()
      return
    }
    try {
      proxy.web(req, res, { target: await target(id) }, (err) => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/html' }).end(page('Preview unavailable', `<h1>Preview unavailable</h1><pre>${escape(err.message)}</pre>`))
      })
    } catch (err) {
      res.writeHead(503, { 'content-type': 'text/html' }).end(page('Preview failed to start', `<h1>Preview failed to start</h1><pre>${escape((err as Error).message)}</pre>`))
    }
  })
  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy())
    const id = match(req.url)
    if (!id || !existsSync(projectDir(id))) return socket.destroy()
    try {
      proxy.ws(req, socket, head, { target: await target(id) }, () => socket.destroy())
    } catch {
      socket.destroy()
    }
  })
  server.listen(config.previewPort, '0.0.0.0')
  return server
}
