import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { config } from './config.ts'
import * as sandbox from './sandbox.ts'

const GPU = existsSync('/dev/dri/renderD128') ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] : []
const CHROME = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p))

let browser: Promise<Browser> | null = null
let idleTimer: NodeJS.Timeout | undefined
let open = 0

function launch() {
  if (!CHROME) throw new Error('No Chrome/Chromium found (set CHROME_PATH)')
  browser ??= puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', ...GPU] }).then((b) => {
    b.on('disconnected', () => (browser = null))
    return b
  })
  return browser
}

export const available = () => Boolean(CHROME)

export type Capture = { image: Uint8Array; errors: string[] }

const within = <T>(work: Promise<T>, ms: number, what: string) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms).unref())])

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  clearTimeout(idleTimer)
  open++
  const page = await (await launch()).newPage()
  try {
    return await fn(page)
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

async function settle(page: Page, errors: string[]) {
  await within(
    page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight * 0.8) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    }),
    15_000,
    'Scrolling through the page',
  ).catch((err: Error) => errors.push(err.message))
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }).catch(() => {})
}

export async function capture(projectId: string, route = '/', opts: { width?: number; height?: number; fullPage?: boolean } = {}): Promise<Capture> {
  await sandbox.ensure(projectId)
  return withPage(async (page) => {
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
    await page.setViewport({ width: opts.width ?? 1280, height: opts.height ?? 800 })
    const url = `${sandbox.url(projectId)}/p/${projectId}${route.startsWith("/") ? route : `/${route}`}`
    const loaded = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 }).then(
      () => true,
      () => (errors.push('The page did not finish loading within 30s (still busy or still fetching); this screenshot shows it as it was then.'), false),
    )
    if (loaded) {
      await settle(page, errors)
      const broken = await within(
        page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => `${i.getAttribute('src')} (alt: "${i.alt}")`)),
        5000,
        'Checking images',
      ).catch(() => [])
      for (const b of broken) errors.push(`Broken image: ${b}`)
    }
    const image = await within(page.screenshot({ type: 'jpeg', quality: 80, fullPage: opts.fullPage ?? false }), 30_000, 'Taking the screenshot')
    return { image, errors: [...new Set(errors)].slice(0, 20) }
  })
}

export type Step = { click?: string; type?: string; into?: string; press?: string }
export type Call = { method: string; url: string; status: number; type: string; request?: string; response?: string }
export type Visit = { image: Uint8Array; url: string; title: string; text: string; links: string[]; calls: Call[]; files: string[]; sources: number; errors: string[] }

const MAX_FILE = 5_000_000
const MAX_TOTAL = 100_000_000

const clean = (p: string) =>
  p
    .replace(/[?#].*$/, '')
    .split('/')
    .map((s) => s.replace(/[^\w.@-]/g, '_').slice(0, 80))
    .filter((s) => s && s !== '.' && s !== '..')

function assetPath(url: URL, origin: string, ext: string) {
  const parts = clean(url.pathname)
  if (!parts.length || !parts.at(-1)!.includes('.')) parts.push(`index${ext}`)
  if (url.search) parts[parts.length - 1] = parts.at(-1)!.replace(/(\.\w+)?$/, (e) => `_${Buffer.from(url.search).toString('base64url').slice(0, 12)}${e || ext}`)
  return url.origin === origin ? path.join(...parts) : path.join(clean(url.host)[0] ?? 'host', ...parts)
}

async function find(page: Page, target: string) {
  const esc = target.replace(/"/g, '\\"')
  for (const sel of [target, `[placeholder="${esc}" i]`, `[aria-label="${esc}" i]`, `[name="${esc}"]`, `::-p-text(${target})`]) {
    const el = await page.$(sel).catch(() => null)
    if (el) return el
  }
  throw new Error(`Nothing on the page matches "${target}"`)
}

export async function browse(target: string, dir: string, opts: { mobile?: boolean; steps?: Step[] } = {}): Promise<Visit> {
  return withPage(async (page) => {
    const errors: string[] = []
    const calls: Call[] = []
    const saved = new Set<string>()
    const pending: Promise<unknown>[] = []
    const scripts: { url: string; body: string; map?: string }[] = []
    let original = ''
    let total = 0
    const save = async (rel: string, data: string | Uint8Array, always = false) => {
      if (!always && (data.length > MAX_FILE || total + data.length > MAX_TOTAL)) return false
      const full = path.join(dir, rel)
      if (!full.startsWith(dir + path.sep)) return false
      total += data.length
      await mkdir(path.dirname(full), { recursive: true })
      await writeFile(full, data)
      saved.add(rel)
      return true
    }
    page.on('pageerror', (err) => errors.push(`Uncaught ${(err as Error).message}`))
    page.on('response', (res) => {
      const req = res.request()
      const kind = req.resourceType()
      const url = res.url()
      if (!/^https?:/.test(url) || res.status() < 200 || (res.status() >= 300 && kind !== 'xhr' && kind !== 'fetch')) return
      pending.push(
        (async () => {
          if (kind === 'document' && req.frame() === page.mainFrame() && !original) original = await res.text()
          else if (kind === 'script' || kind === 'stylesheet') {
            const body = await res.text()
            await save(path.join('assets', assetPath(new URL(url), new URL(target).origin, kind === 'script' ? '.js' : '.css')), body)
            scripts.push({ url, body, map: res.headers()['sourcemap'] ?? res.headers()['x-sourcemap'] })
          } else if (kind === 'xhr' || kind === 'fetch') {
            const type = res.headers()['content-type'] ?? ''
            const response = /json|text|xml|graphql|javascript/.test(type) ? (await res.text().catch(() => '')).slice(0, 20_000) : undefined
            calls.push({ method: req.method(), url, status: res.status(), type, request: req.postData()?.slice(0, 4000), response })
          }
        })().catch(() => {}),
      )
    })
    const browserUA = await page.browser().userAgent()
    await page.setUserAgent(browserUA.replace('HeadlessChrome', 'Chrome'))
    await page.setViewport(opts.mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 })
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => errors.push('The page did not finish loading within 30s; what follows is how it was then.'))
    await settle(page, errors)
    for (const [i, step] of (opts.steps ?? []).entries()) {
      try {
        if (step.click) await within((await find(page, step.click)).click(), 10_000, `Clicking "${step.click}"`)
        if (step.type !== undefined) {
          const el = await find(page, step.into ?? ':focus')
          await el.click({ count: 3 })
          await el.type(step.type, { delay: 20 })
        }
        if (step.press) await page.keyboard.press(step.press as Parameters<Page['keyboard']['press']>[0])
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {})
      } catch (err) {
        errors.push(`Step ${i + 1} failed: ${(err as Error).message}`)
        break
      }
    }
    await Promise.all(pending)
    let sources = 0
    for (const s of scripts) {
      const ref = s.map ?? s.body.slice(-600).match(/[#@] sourceMappingURL=(\S+)\s*(\*\/)?\s*$/)?.[1]
      if (!ref) continue
      try {
        const raw = ref.startsWith('data:')
          ? Buffer.from(ref.slice(ref.indexOf(',') + 1), ref.includes(';base64,') ? 'base64' : 'utf8').toString()
          : await (await fetch(new URL(ref, s.url), { signal: AbortSignal.timeout(15_000) })).text()
        const map = JSON.parse(raw) as { sources?: string[]; sourcesContent?: (string | null)[] }
        for (const [j, src] of (map.sources ?? []).entries()) {
          const content = map.sourcesContent?.[j]
          if (!content || /node_modules|^webpack\/(runtime|bootstrap)|\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|ico)$/.test(src)) continue
          const parts = clean(src.replace(/^[\w-]+:\/\/[^/]*\//, ''))
          if (!parts.length) continue
          if (await save(path.join('sources', ...parts), content)) sources++
        }
      } catch {}
    }
    const info = await within(
      page.evaluate(() => ({
        title: document.title,
        text: document.body?.innerText ?? '',
        links: [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href).filter((h) => h.startsWith(location.origin)),
      })),
      10_000,
      'Reading the page',
    ).catch(() => ({ title: '', text: '', links: [] as string[] }))
    const finalUrl = new URL(page.url())
    const slug = (clean(finalUrl.pathname).join('_') || 'index') + (opts.steps?.length ? `_after-${opts.steps.length}-steps` : '') + (opts.mobile ? '_mobile' : '')
    const image = await within(page.screenshot({ type: 'jpeg', quality: 80 }), 30_000, 'Taking the screenshot')
    const pageDir = path.join('pages', slug)
    await save(path.join(pageDir, 'rendered.html'), await page.content().catch(() => ''), true)
    if (original) await save(path.join(pageDir, 'original.html'), original, true)
    await save(path.join(pageDir, 'text.txt'), info.text, true)
    await save(path.join(pageDir, 'network.json'), JSON.stringify(calls, null, 2), true)
    await save(path.join(pageDir, 'screenshot.jpg'), image, true)
    return { image, url: finalUrl.href, title: info.title, text: info.text, links: [...new Set(info.links)], calls, files: [...saved], sources, errors: [...new Set(errors)].slice(0, 20) }
  })
}

export const thumbnailPath = (projectId: string) => path.join(config.dataDir, 'thumbnails', `${projectId}.jpg`)

export async function saveThumbnail(projectId: string, image: Uint8Array) {
  await mkdir(path.dirname(thumbnailPath(projectId)), { recursive: true })
  await writeFile(thumbnailPath(projectId), image)
}

export async function renderedText(url: string): Promise<string> {
  return withPage(async (page) => {
    await page.setUserAgent((await page.browser().userAgent()).replace('HeadlessChrome', 'Chrome'))
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {})
    return within(page.evaluate(() => document.body?.innerText ?? ''), 10_000, 'Reading the page').catch(() => '')
  })
}
