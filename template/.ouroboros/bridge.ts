type Payload = Record<string, unknown>

const post = (type: string, data: Payload = {}) => {
  if (window.parent === window) return
  try {
    window.parent.postMessage({ source: 'ouroboros-preview', type, ...data }, '*')
  } catch {
    // ignore non-cloneable payloads
  }
}

const serialize = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`
  const seen = new WeakSet()
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
      }
      if (typeof v === 'function') return `[Function ${v.name}]`
      return v
    }) ?? String(value)
  } catch {
    return String(value)
  }
}

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    original(...args)
    post('console', { level, message: args.map(serialize).join(' ').slice(0, 4000) })
  }
}

window.addEventListener(
  'error',
  (e) => {
    const el = e.target
    if (el instanceof HTMLImageElement || el instanceof HTMLScriptElement || el instanceof HTMLLinkElement) {
      const src = el instanceof HTMLLinkElement ? el.href : el.getAttribute('src')
      post('console', { level: 'error', message: `Failed to load ${el.tagName.toLowerCase()}: ${src}` })
      return
    }
    if (e instanceof ErrorEvent) post('runtime-error', { message: e.message, stack: e.error?.stack ?? '', file: e.filename, line: e.lineno })
  },
  true,
)
window.addEventListener('unhandledrejection', (e) => {
  post('runtime-error', { message: `Unhandled rejection: ${serialize(e.reason)}`, stack: e.reason?.stack ?? '' })
})

const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const started = performance.now()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  try {
    const res = await originalFetch(input, init)
    if (!url.includes('/@vite/') && !url.includes('/node_modules/')) {
      post('network', { method, url, status: res.status, ms: Math.round(performance.now() - started) })
    }
    return res
  } catch (err) {
    post('network', { method, url, status: 0, error: serialize(err), ms: Math.round(performance.now() - started) })
    throw err
  }
}

const reportLocation = () => post('location', { path: location.pathname + location.search + location.hash, title: document.title })
for (const method of ['pushState', 'replaceState'] as const) {
  const original = history[method].bind(history)
  history[method] = (...args: Parameters<History['pushState']>) => {
    original(...args)
    reportLocation()
  }
}
window.addEventListener('popstate', reportLocation)
window.addEventListener('hashchange', reportLocation)

if (import.meta.hot) {
  import.meta.hot.on('vite:error', (payload) => {
    const err = payload.err
    post('build-error', { message: err.message, stack: err.stack, file: err.id ?? err.loc?.file ?? '', frame: err.frame ?? '' })
  })
  import.meta.hot.on('vite:afterUpdate', () => post('hmr'))
}

// Element selection & annotation overlay
let selecting = false
const marked = new Map<string, HTMLDivElement>()
const hover = document.createElement('div')
const label = document.createElement('div')

const style = (el: HTMLElement, css: Partial<CSSStyleDeclaration>) => Object.assign(el.style, css)
style(hover, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483646', border: '2px solid #2563eb', background: 'rgba(37,99,235,0.08)', borderRadius: '2px', display: 'none' })
style(label, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483647', background: '#2563eb', color: '#fff', font: '500 11px/1.6 ui-sans-serif, system-ui', padding: '0 6px', borderRadius: '3px', display: 'none' })

const target = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>('[data-oid]') : null)

const place = (box: HTMLElement, el: Element) => {
  const r = el.getBoundingClientRect()
  style(box, { display: 'block', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` })
  return r
}

const describe = (el: HTMLElement) => ({
  oid: el.dataset.oid,
  tag: el.tagName.toLowerCase(),
  text: (el.innerText ?? '').trim().slice(0, 300),
  className: typeof el.className === 'string' ? el.className : '',
  html: el.outerHTML.slice(0, 600),
  hasOnlyText: el.childElementCount === 0,
  styles: (() => {
    const cs = getComputedStyle(el)
    return { color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight, padding: cs.padding, margin: cs.margin, borderRadius: cs.borderRadius, textAlign: cs.textAlign }
  })(),
})

const onMove = (e: MouseEvent) => {
  const el = target(e.target)
  if (!el) return style(hover, { display: 'none' }), style(label, { display: 'none' })
  const r = place(hover, el)
  label.textContent = el.tagName.toLowerCase()
  style(label, { display: 'block', top: `${Math.max(0, r.top - 18)}px`, left: `${r.left}px` })
}

const onClick = (e: MouseEvent) => {
  const el = target(e.target)
  if (!el) return
  e.preventDefault()
  e.stopPropagation()
  post('element-selected', describe(el))
}

const block = (e: Event) => {
  if (selecting) {
    e.preventDefault()
    e.stopPropagation()
  }
}

const setSelecting = (on: boolean) => {
  selecting = on
  document.documentElement.style.cursor = on ? 'crosshair' : ''
  if (!on) style(hover, { display: 'none' }), style(label, { display: 'none' })
  const fn = on ? 'addEventListener' : 'removeEventListener'
  document[fn]('mousemove', onMove, true)
  document[fn]('click', onClick, true)
  document[fn]('mousedown', block, true)
  document[fn]('submit', block, true)
}

const redrawMarks = () => {
  for (const [oid, box] of marked) {
    const el = document.querySelector(`[data-oid="${CSS.escape(oid)}"]`)
    if (el) place(box, el)
    else style(box, { display: 'none' })
  }
}

const setMarks = (oids: string[]) => {
  for (const [oid, box] of marked) {
    if (!oids.includes(oid)) {
      box.remove()
      marked.delete(oid)
    }
  }
  oids.forEach((oid, i) => {
    if (marked.has(oid)) return
    const box = document.createElement('div')
    style(box, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483645', border: '2px solid #2563eb', borderRadius: '2px' })
    const badge = document.createElement('span')
    badge.textContent = String(i + 1)
    style(badge, { position: 'absolute', top: '-10px', left: '-10px', width: '18px', height: '18px', borderRadius: '9px', background: '#2563eb', color: '#fff', font: '600 11px/18px ui-sans-serif, system-ui', textAlign: 'center' })
    box.append(badge)
    document.body.append(box)
    marked.set(oid, box)
  })
  redrawMarks()
}

window.addEventListener('scroll', redrawMarks, true)
window.addEventListener('resize', redrawMarks)

window.addEventListener('message', (e) => {
  const msg = e.data
  if (!msg || msg.source !== 'ouroboros-host') return
  if (msg.type === 'select-mode') setSelecting(Boolean(msg.enabled))
  if (msg.type === 'select-parent') {
    const el = document.querySelector<HTMLElement>(`[data-oid="${CSS.escape(msg.oid)}"]`)
    const parent = el?.parentElement?.closest<HTMLElement>('[data-oid]')
    if (parent) post('element-selected', describe(parent))
  }
  if (msg.type === 'marks') setMarks(msg.oids ?? [])
  if (msg.type === 'navigate') history.pushState(null, '', msg.path), dispatchEvent(new PopStateEvent('popstate'))
  if (msg.type === 'preview-edit') {
    const el = document.querySelector<HTMLElement>(`[data-oid="${CSS.escape(msg.oid)}"]`)
    if (!el) return
    if (typeof msg.text === 'string') el.innerText = msg.text
    if (typeof msg.className === 'string') el.className = msg.className
  }
})

const TOKENS = ['background', 'foreground', 'card', 'primary', 'primary-foreground', 'secondary', 'muted', 'muted-foreground', 'accent', 'destructive']
const reportTheme = () => {
  const root = getComputedStyle(document.documentElement)
  post('theme', { tokens: Object.fromEntries(TOKENS.map((t) => [t, root.getPropertyValue(`--${t}`).trim()])) })
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.append(hover, label)
  reportLocation()
  post('ready')
  setTimeout(reportTheme, 300)
})
import.meta.hot?.on('vite:afterUpdate', () => setTimeout(reportTheme, 100))
