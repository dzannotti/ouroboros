import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'
import { config } from './config.ts'
import * as sandbox from './sandbox.ts'

const CHROME = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p))

let browser: Promise<Browser> | null = null
let idleTimer: NodeJS.Timeout | undefined
let open = 0

function launch() {
  if (!CHROME) throw new Error('No Chrome/Chromium found (set CHROME_PATH)')
  browser ??= puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }).then((b) => {
    b.on('disconnected', () => (browser = null))
    return b
  })
  return browser
}

export const available = () => Boolean(CHROME)

export type Capture = { image: Uint8Array; errors: string[] }

export async function capture(projectId: string, route = '/', opts: { width?: number; height?: number; fullPage?: boolean } = {}): Promise<Capture> {
  await sandbox.ensure(projectId)
  clearTimeout(idleTimer)
  open++
  const page = await (await launch()).newPage()
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`Uncaught ${(err as Error).message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|Failed to load resource/.test(msg.text())) errors.push(msg.text())
  })
  page.on('response', (res) => {
    const url = res.url()
    if (res.status() >= 400 && url.includes(`/p/${projectId}/`) && !/favicon/.test(url)) errors.push(`HTTP ${res.status()} for ${url.replace(/^https?:\/\/[^/]+\/p\/[^/]+/, '')}`)
  })
  page.on('requestfailed', (req) => {
    if (!/favicon/.test(req.url())) errors.push(`Request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`)
  })
  try {
    await page.setViewport({ width: opts.width ?? 1280, height: opts.height ?? 800 })
    const url = `${sandbox.url(projectId)}/p/${projectId}${route.startsWith("/") ? route : `/${route}`}`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight * 0.8) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }).catch(() => {})
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => `${i.getAttribute('src')} (alt: "${i.alt}")`))
    for (const b of broken) errors.push(`Broken image: ${b}`)
    const image = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: opts.fullPage ?? false })
    return { image, errors: [...new Set(errors)].slice(0, 20) }
  } finally {
    await page.close().catch(() => {})
    if (--open === 0) {
      idleTimer = setTimeout(() => {
        const b = browser
        browser = null
        void b?.then((x) => x.close()).catch(() => {})
      }, 120_000)
      idleTimer.unref()
    }
  }
}

export const thumbnailPath = (projectId: string) => path.join(config.dataDir, 'thumbnails', `${projectId}.jpg`)

export async function saveThumbnail(projectId: string, image: Uint8Array) {
  await mkdir(path.dirname(thumbnailPath(projectId)), { recursive: true })
  await writeFile(thumbnailPath(projectId), image)
}
