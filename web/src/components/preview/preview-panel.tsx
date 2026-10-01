import type { SandboxStatus, SelectedElement } from '@shared/types'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, SquareTerminal, Wand2, X } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { onProjectEvent } from '@/hooks/use-project-events'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Device = 'desktop' | 'tablet' | 'mobile'
export type LogEntry = { id: number; level: string; message: string; at: number; source: 'server' | 'browser' }
export type PreviewHandle = { reload: () => void; navigate: (path: string) => void; selectParent: (oid: string) => void; path: string }

const WIDTHS: Record<Device, string> = { desktop: '100%', tablet: '820px', mobile: '390px' }

type Props = {
  projectId: string
  src: string
  sandbox: { status: SandboxStatus; error?: string }
  device: Device
  selecting: boolean
  marks: string[]
  onSelect: (el: SelectedElement) => void
  onFix: (error: string) => void
  onPath: (path: string) => void
  onTheme?: (tokens: Record<string, string>) => void
  busy: boolean
}

let logId = 0

export const PreviewPanel = forwardRef<PreviewHandle, Props>(function PreviewPanel(props, ref) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [nonce, setNonce] = useState(0)
  const [path, setPath] = useState('/')
  const [loaded, setLoaded] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const outbox = useRef<{ level: string; message: string }[]>([])
  const { onSelect, onPath, onTheme, projectId } = props

  const post = useCallback((msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ source: 'ouroboros-host', ...msg }, '*'), [])

  useImperativeHandle(ref, () => ({
    reload: () => {
      setLoaded(false)
      setNonce((n) => n + 1)
    },
    navigate: (p: string) => post({ type: 'navigate', path: p }),
    selectParent: (oid: string) => post({ type: 'select-parent', oid }),
    path,
  }))

  useEffect(() => {
    const flush = setInterval(() => {
      if (!outbox.current.length) return
      const batch = outbox.current.splice(0, 100)
      void api.previewLogs(projectId, batch).catch(() => {})
    }, 1500)
    return () => clearInterval(flush)
  }, [projectId])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== 'ouroboros-preview') return
      const d = e.data
      const log = (level: string, message: string) => {
        outbox.current.push({ level, message })
        setLogs((prev) => [...prev.slice(-299), { id: ++logId, level, message, at: Date.now(), source: 'browser' }])
      }
      if (d.type === 'ready') {
        setLoaded(true)
        setError(null)
      }
      if (d.type === 'location') {
        setPath(d.path)
        onPath(d.path)
      }
      if (d.type === 'console') log(d.level, d.message)
      if (d.type === 'runtime-error') {
        log('error', `${d.message}${d.stack ? `\n${d.stack}` : ''}`)
        setError(d.message)
      }
      if (d.type === 'build-error') {
        log('error', `${d.message}${d.frame ? `\n${d.frame}` : ''}`)
        setError(`${d.file ? `${d.file}: ` : ''}${d.message}`)
      }
      if (d.type === 'hmr') setError(null)
      if (d.type === 'network' && (d.status >= 400 || d.status === 0)) log('error', `${d.method} ${d.url} → ${d.status || d.error}`)
      if (d.type === 'element-selected') onSelect(d as SelectedElement)
      if (d.type === 'theme') onTheme?.(d.tokens)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onSelect, onPath, onTheme])

  useEffect(
    () =>
      onProjectEvent((e) => {
        if (e.type !== 'log') return
        setLogs((prev) => [...prev.slice(-299), { id: ++logId, level: e.level, message: e.message, at: e.at, source: 'server' }])
      }),
    [],
  )

  const booting = props.sandbox.status === 'starting' || props.sandbox.status === 'installing'
  useEffect(() => {
    if (booting) setConsoleOpen(true)
  }, [booting])

  useEffect(() => post({ type: 'select-mode', enabled: props.selecting }), [props.selecting, loaded, post])
  useEffect(() => post({ type: 'marks', oids: props.marks }), [props.marks, loaded, post])

  const ready = props.sandbox.status === 'ready'
  const errors = logs.filter((l) => l.level === 'error').length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-muted/40">
        {ready ? (
          <iframe
            key={nonce}
            ref={frame}
            src={props.src}
            title="App preview"
            onLoad={() => setLoaded(true)}
            className={cn('h-full border-0 bg-white transition-[width] duration-300', props.device !== 'desktop' && 'my-4 rounded-xl border shadow-sm')}
            style={{ width: WIDTHS[props.device], height: props.device === 'desktop' ? '100%' : 'calc(100% - 2rem)' }}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <SandboxState status={props.sandbox.status} error={props.sandbox.error} projectId={props.projectId} />
        )}
        {ready && !loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !props.busy && (
          <div className="absolute inset-x-4 bottom-4 mx-auto flex max-w-xl items-start gap-3 rounded-xl border bg-card p-3 shadow-lg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium">Something went wrong in the preview</span>
              <span className="line-clamp-2 font-mono text-xs break-all text-muted-foreground">{error}</span>
            </div>
            <Button
              size="sm"
              onClick={() => {
                props.onFix(error)
                setError(null)
              }}
            >
              <Wand2 /> Try to fix
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setError(null)} aria-label="Dismiss">
              <X />
            </Button>
          </div>
        )}
      </div>
      <div className={cn('flex shrink-0 flex-col border-t bg-background', consoleOpen && 'h-56')}>
        <button type="button" onClick={() => setConsoleOpen((o) => !o)} className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground">
          <SquareTerminal className="size-3.5" />
          Console
          {errors > 0 && <span className="rounded bg-destructive/10 px-1.5 font-medium text-destructive">{errors}</span>}
          {consoleOpen && logs.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              className="ml-2 underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                setLogs([])
              }}
              onKeyDown={(e) => e.key === 'Enter' && setLogs([])}
            >
              Clear
            </span>
          )}
          {consoleOpen ? <ChevronDown className="ml-auto size-3.5" /> : <ChevronUp className="ml-auto size-3.5" />}
        </button>
        {consoleOpen && (
          <div className="min-h-0 flex-1 overflow-auto border-t font-mono text-[11px]">
            {logs.length ? (
              logs.map((l) => (
                <div key={l.id} className={cn('flex gap-2 border-b px-3 py-1', l.level === 'error' ? 'bg-destructive/5 text-destructive' : l.level === 'warn' ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className="shrink-0 opacity-60">{new Date(l.at).toLocaleTimeString()}</span>
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px] leading-4 uppercase">{l.source}</span>
                  <span className="min-w-0 whitespace-pre-wrap">{l.message}</span>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-muted-foreground">No console output yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

function SandboxState({ status, error, projectId }: { status: SandboxStatus; error?: string; projectId: string }) {
  const [restarting, setRestarting] = useState(false)
  if (status === 'error') {
    return (
      <div className="flex max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-6 text-destructive" />
        <p className="font-medium">The preview could not start</p>
        {error && <pre className="max-h-48 w-full overflow-auto rounded-lg border bg-card p-3 text-left font-mono text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>}
        <Button
          variant="outline"
          disabled={restarting}
          onClick={async () => {
            setRestarting(true)
            await api.restartSandbox(projectId).catch(() => {})
            setRestarting(false)
          }}
        >
          <RefreshCw className={cn(restarting && 'animate-spin')} /> Restart preview
        </Button>
      </div>
    )
  }
  const label = status === 'installing' ? 'Installing dependencies…' : status === 'stopped' ? 'Waking up preview…' : 'Starting preview…'
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      {label}
    </div>
  )
}
