import type { Message, SelectedElement } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ChevronDown, Code2, Copy, Eye, Loader2, Database, Download, ExternalLink, History, Monitor, MousePointerClick, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings2, Smartphone, Tablet, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Composer, type Draft } from '@/components/chat/composer'
import { AssistantMessage, type MessageActions, UserMessage } from '@/components/chat/message'
import { LogoMark } from '@/components/logo'
import { ElementEditor } from '@/components/preview/element-editor'
import { type Device, type PreviewHandle, PreviewPanel } from '@/components/preview/preview-panel'
import { CloudView } from '@/components/project/cloud-view'
import { CodeView } from '@/components/project/code-view'
import { SettingsDialog } from '@/components/project/settings-dialog'
import { DiffDialog, VersionsPanel } from '@/components/project/versions-panel'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { onProjectEvent, useProjectEvents, useSandbox } from '@/hooks/use-project-events'
import { api, previewOrigin } from '@/lib/api'
import { draftToInput } from '@/lib/send'
import { cn } from '@/lib/utils'

type View = 'preview' | 'code' | 'cloud'

export default function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  useProjectEvents(id)
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
  const { data: project, error } = useQuery({ queryKey: ['project', id], queryFn: () => api.project(id) })
  const { data: messages } = useQuery({ queryKey: ['messages', id], queryFn: () => api.messages(id) })
  const { data: versions } = useQuery({ queryKey: ['versions', id], queryFn: () => api.versions(id) })
  const sandbox = useSandbox(id, project?.sandbox)

  const [view, setView] = useState<View>('preview')
  const [device, setDevice] = useState<Device>('desktop')
  const [panel, setPanel] = useState<'chat' | 'history'>('chat')
  const [chatOpen, setChatOpen] = useState(true)
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat')
  const [selecting, setSelecting] = useState(false)
  const [elements, setElements] = useState<SelectedElement[]>([])
  const [editing, setEditing] = useState<SelectedElement | null>(null)
  const [theme, setTheme] = useState<Record<string, string>>({})
  const [route, setRoute] = useState('/')
  const [routeInput, setRouteInput] = useState('/')
  const [text, setText] = useState('')
  const [settings, setSettings] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [diff, setDiff] = useState<{ sha: string; title: string } | null>(null)
  const [queue, setQueue] = useState<Draft[]>([])
  const [snapshot, setSnapshot] = useState<{ sha: string; url?: string; error?: string } | null>(null)
  const preview = useRef<PreviewHandle>(null)
  const desktop = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    if (project) document.title = `${project.name} – Ouroboros`
  }, [project])

  useEffect(
    () =>
      onProjectEvent((e) => {
        if (e.type === 'versions' && !project?.running) preview.current?.reload()
      }),
    [project?.running],
  )

  const running = Boolean(project?.running)
  const lastMessage = messages?.at(-1)
  const suggestions = lastMessage?.role === 'assistant' ? (lastMessage.parts.find((p) => p.type === 'suggestions')?.items ?? []) : []
  const building = running && (versions?.length ?? 0) <= 1
  const currentStep = (() => {
    const parts = lastMessage?.role === 'assistant' ? lastMessage.parts : []
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (p.type === 'tool') return p.label
      if (p.type === 'plan') return p.tasks.find((t) => t.status === 'in_progress')?.title
    }
    return undefined
  })()
  const model = project?.model ?? config?.models[0]?.id ?? ''

  const dispatch = useCallback(
    async (draft: Draft) => {
      const input = await draftToInput(id, draft, { elements: elements.length ? elements : undefined })
      await api.send(id, input)
      setElements([])
      setSelecting(false)
      setEditing(null)
    },
    [id, elements],
  )

  const queueRef = useRef<Draft[]>([])
  const updateQueue = (next: Draft[]) => {
    queueRef.current = next
    setQueue(next)
  }

  const send = useCallback(
    async (draft: Draft) => {
      if (running) updateQueue([...queueRef.current, draft].slice(0, 10))
      else await dispatch(draft)
    },
    [running, dispatch],
  )

  useEffect(
    () =>
      onProjectEvent((e) => {
        if (e.type !== 'status' || !queueRef.current.length) return
        const [next, ...rest] = queueRef.current
        updateQueue(rest)
        setTimeout(() => dispatch(next).catch((err: Error) => toast.error(err.message)), 300)
      }),
    [dispatch],
  )

  const sendText = useCallback(
    (value: string) =>
      api.send(id, { text: value, model }).catch((err: Error) => {
        toast.error(err.message)
      }),
    [id, model],
  )

  const setModel = (m: string) => {
    qc.setQueryData(['project', id], (p: typeof project) => p && { ...p, model: m })
    void api.updateProject(id, { model: m })
  }

  const restore = useMutation({
    mutationFn: (sha: string) => api.restore(id, sha),
    onSuccess: () => {
      toast.success('Version restored')
      preview.current?.reload()
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteProject(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    },
    onError: (err) => toast.error(err.message),
  })

  const editingRef = useRef<SelectedElement | null>(null)
  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  const onSelect = useCallback((el: SelectedElement) => {
    const current = editingRef.current
    setElements((prev) => {
      const without = current && current.oid !== el.oid && el.html?.includes(current.oid) ? prev.filter((e) => e.oid !== current.oid) : prev
      return without.some((e) => e.oid === el.oid) ? without : [...without, el].slice(-10)
    })
    setEditing(el)
  }, [])

  const base = project?.previewUrl.replace(/\/$/, '') ?? ''
  const onPath = useCallback(
    (p: string) => {
      const rel = base && p.startsWith(base) ? p.slice(base.length) || '/' : p
      setRoute(rel)
      setRouteInput(rel)
    },
    [base],
  )

  const openSnapshot = useCallback(
    (sha: string) => {
      setView('preview')
      setMobileTab('preview')
      setSnapshot({ sha })
      api
        .previewVersion(id, sha)
        .then((r) => setSnapshot((s) => (s?.sha === sha ? { sha, url: r.url } : s)))
        .catch((err: Error) => setSnapshot((s) => (s?.sha === sha ? { sha, error: err.message } : s)))
    },
    [id],
  )

  const actions: MessageActions = useMemo(() => {
    const lastUser = [...(messages ?? [])].reverse().find((m) => m.role === 'user')
    const order = [...(versions ?? [])].reverse()
    return {
      onRetry: lastUser
        ? () => {
            const t = lastUser.parts.find((p) => p.type === 'text')?.text
            if (t) void sendText(t)
          }
        : undefined,
      onRestore: (sha) => restore.mutate(sha),
      onDiff: (sha, title) => setDiff({ sha, title }),
      onPreview: (sha) => openSnapshot(sha),
      onUndo: versions && versions.length > 1 ? () => restore.mutate(versions[1].sha) : undefined,
      onImplementPlan: () => void api.send(id, { text: 'Implement the plan above.', mode: 'build', model }).catch((err: Error) => toast.error(err.message)),
      onAnswer: (t) => void sendText(t),
      onContinue: () => void sendText('Continue where you left off and finish the work.'),
      onDecide: (approvalId, approved, values) => api.decide(id, approvalId, { approved, values }),
      versionNumber: (sha) => {
        const i = order.findIndex((v) => v.sha === sha)
        return i === -1 ? undefined : i + 1
      },
      currentSha: versions?.[0]?.sha,
      assetUrl: project ? (p) => `${previewOrigin(config)}${project.previewUrl}${p}` : undefined,
    }
  }, [messages, versions, sendText, restore, project, config, id, model, openSnapshot])

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="font-medium">{error.message}</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Back to projects
        </Button>
      </div>
    )
  }

  const src = project ? `${previewOrigin(config)}${project.previewUrl.replace(/\/$/, '')}${route === '/' ? '/' : route}` : ''
  const iframeSrc = project ? `${previewOrigin(config)}${project.previewUrl}` : ''

  const chat = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium hover:bg-muted">
              <LogoMark className="size-5 shrink-0" />
              <span className="truncate">{project?.name ?? <Skeleton className="h-4 w-28" />}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => navigate('/')}>
              <LogoMark className="size-4" /> All projects
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSettings(true)}>
              <Settings2 /> Settings & knowledge
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void api
                  .remix(id)
                  .then((p) => {
                    void qc.invalidateQueries({ queryKey: ['projects'] })
                    toast.success(`Created ${p.name}`)
                    navigate(`/projects/${p.id}`)
                  })
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              <Copy /> Remix project
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={api.downloadUrl(id)} download>
                <Download /> Download code
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label={panel === 'history' ? 'Back to chat' : 'Version history'} active={panel === 'history'} onClick={() => setPanel((p) => (p === 'history' ? 'chat' : 'history'))}>
            <History />
          </IconButton>
          <IconButton label="Hide chat" className="hidden md:inline-flex" onClick={() => setChatOpen(false)}>
            <PanelLeftClose />
          </IconButton>
        </div>
      </div>
      {panel === 'history' ? (
        <VersionsPanel projectId={id} running={running} onRestore={(sha) => restore.mutate(sha)} onPreview={openSnapshot} onClose={() => setPanel('chat')} />
      ) : (
        <>
          <MessageList messages={messages} actions={actions} onEdit={setText} />
          <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
            {queue.length > 0 && (
              <div className="flex flex-col gap-1 rounded-xl border bg-card p-2">
                <span className="px-1 text-xs text-muted-foreground">Queued ({queue.length}) — sent when the current response finishes</span>
                {queue.map((q, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate">{q.text || 'Selected elements'}</span>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Remove from queue" onClick={() => updateQueue(queueRef.current.filter((_, j) => j !== i))}>
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!running && suggestions.length > 0 && !text && (
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="Suggestions">
                {suggestions.map((sg) => (
                  <Button key={sg} variant="outline" size="sm" className="h-7 shrink-0 rounded-full text-xs font-normal text-muted-foreground" onClick={() => setText(sg)}>
                    {sg}
                  </Button>
                ))}
              </div>
            )}
            <Composer
              model={model}
              onModelChange={setModel}
              onSubmit={send}
              running={running}
              onStop={() => void api.stop(id)}
              elements={elements}
              onRemoveElement={(oid) => setElements((prev) => prev.filter((e) => e.oid !== oid))}
              selecting={selecting}
              onToggleSelect={() => {
                setSelecting((s) => !s)
                setMobileTab('preview')
              }}
              text={text}
              onTextChange={setText}
            />
          </div>
        </>
      )}
    </div>
  )

  const previewArea = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        {!chatOpen && (
          <IconButton label="Show chat" className="hidden md:inline-flex" onClick={() => setChatOpen(true)}>
            <PanelLeftOpen />
          </IconButton>
        )}
        <IconButton label="Refresh preview" onClick={() => preview.current?.reload()}>
          <RefreshCw />
        </IconButton>
        <IconButton label="Open in new tab" onClick={() => window.open(src, '_blank', 'noopener')}>
          <ExternalLink />
        </IconButton>
        <IconButton
          label={selecting ? 'Stop selecting' : 'Select an element to edit'}
          active={selecting}
          onClick={() => {
            setView('preview')
            setSelecting((s) => !s)
          }}
        >
          <MousePointerClick />
        </IconButton>
        <form
          className="mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-lg border bg-muted/50 px-2"
          onSubmit={(e) => {
            e.preventDefault()
            const p = routeInput.startsWith('/') ? routeInput : `/${routeInput}`
            preview.current?.navigate(`${base}${p}`)
          }}
        >
          <ToggleGroup type="single" size="sm" value={device} onValueChange={(v) => v && setDevice(v as Device)} aria-label="Device size" className="hidden lg:flex">
            <ToggleGroupItem value="desktop" aria-label="Desktop" className="size-6 min-w-6">
              <Monitor className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="tablet" aria-label="Tablet" className="size-6 min-w-6">
              <Tablet className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="mobile" aria-label="Mobile" className="size-6 min-w-6">
              <Smartphone className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          <input
            value={routeInput}
            onChange={(e) => setRouteInput(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
            aria-label="Preview route"
            spellCheck={false}
          />
        </form>
        <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="View">
          <ToggleGroupItem value="preview" className="px-2.5 text-xs">
            Preview
          </ToggleGroupItem>
          <ToggleGroupItem value="code" className="gap-1 px-2.5 text-xs">
            <Code2 className="size-3.5" /> Code
          </ToggleGroupItem>
          <ToggleGroupItem value="cloud" className="gap-1 px-2.5 text-xs">
            <Database className="size-3.5" /> Cloud
          </ToggleGroupItem>
        </ToggleGroup>
        <IconButton label="Download code" onClick={() => (location.href = api.downloadUrl(id))}>
          <Download />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden border-t md:mr-2 md:mb-2 md:rounded-xl md:border">
        {project && (
          <div className={cn('h-full', view !== 'preview' && 'hidden')}>
            <PreviewPanel
              ref={preview}
              projectId={id}
              src={iframeSrc}
              sandbox={sandbox ?? project.sandbox}
              device={device}
              selecting={selecting}
              marks={elements.map((e) => e.oid)}
              onSelect={onSelect}
              onPath={onPath}
              onTheme={setTheme}
              busy={running}
              onFix={(err) => void sendText(`The preview shows this error. Find the cause and fix it:\n\n${err}`)}
            />
            {snapshot && (
              <div className="absolute inset-0 z-20 flex flex-col bg-background">
                <div className="flex shrink-0 items-center gap-2 border-b bg-selection/10 px-3 py-2 text-sm">
                  <Eye className="size-4 text-selection" />
                  <span>
                    Previewing <span className="font-medium">v{actions.versionNumber?.(snapshot.sha) ?? '?'}</span> — this is how the app looked before.
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => setSnapshot(null)}>
                    Exit
                  </Button>
                  <Button
                    size="sm"
                    className="bg-selection text-selection-foreground hover:bg-selection/90"
                    disabled={running}
                    onClick={() => {
                      restore.mutate(snapshot.sha)
                      setSnapshot(null)
                    }}
                  >
                    Restore this version
                  </Button>
                </div>
                {snapshot.url ? (
                  <iframe title="Version preview" src={`${previewOrigin(config)}${snapshot.url}`} className="min-h-0 flex-1 border-0 bg-white" />
                ) : snapshot.error ? (
                  <pre className="m-6 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">{snapshot.error}</pre>
                ) : (
                  <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Building this version…
                  </div>
                )}
              </div>
            )}
            {building && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background">
                <div className="flex w-72 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center gap-1.5 border-b px-3 py-2">
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                  </div>
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="font-medium">Building your app</span>
                  <span className="shimmer max-w-sm truncate text-sm text-muted-foreground">{currentStep ?? 'Getting started…'}</span>
                </div>
              </div>
            )}
            {editing && (
              <ElementEditor
                key={editing.oid}
                projectId={id}
                element={editing}
                theme={theme}
                disabled={running}
                onClose={() => setEditing(null)}
                onParent={() => preview.current?.selectParent(editing.oid)}
                onAsk={(t) => {
                  const el = editing
                  setEditing(null)
                  setSelecting(false)
                  void api
                    .send(id, { text: t, model, elements: [el] })
                    .then(() => setElements([]))
                    .catch((err: Error) => toast.error(err.message))
                }}
              />
            )}
          </div>
        )}
        {view === 'code' && <CodeView projectId={id} readOnly={running} />}
        {view === 'cloud' && (
          <CloudView
            projectId={id}
            onAsk={(t) => {
              setText(t)
              setMobileTab('chat')
            }}
          />
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-svh flex-col bg-background">
      {desktop ? (
        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal">
            {chatOpen && (
              <>
                <ResizablePanel id="chat" defaultSize={440} minSize={340} maxSize="55">
                  {chat}
                </ResizablePanel>
                <ResizableHandle className="bg-transparent" />
              </>
            )}
            <ResizablePanel id="preview" minSize="35">
              {previewArea}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <>
          <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-b">
            <ToggleGroup type="single" size="sm" value={mobileTab} onValueChange={(v) => v && setMobileTab(v as typeof mobileTab)}>
              <ToggleGroupItem value="chat" className="px-4 text-xs">
                Chat
              </ToggleGroupItem>
              <ToggleGroupItem value="preview" className="px-4 text-xs">
                Preview
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={cn('flex min-h-0 flex-1 flex-col', mobileTab !== 'chat' && 'hidden')}>{chat}</div>
            <div className={cn('flex min-h-0 flex-1 flex-col', mobileTab !== 'preview' && 'hidden')}>{previewArea}</div>
          </div>
        </>
      )}
      <DiffDialog projectId={id} version={diff ? { sha: diff.sha, title: diff.title, createdAt: '', good: false, current: false } : null} onClose={() => setDiff(null)} />
      {project && <SettingsDialog project={project} open={settings} onOpenChange={setSettings} />}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the project, its files and its chat history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function IconButton({ label, children, onClick, active, className }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-8 text-muted-foreground', active && 'bg-selection/10 text-selection hover:bg-selection/15 hover:text-selection', className)} onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function MessageList({ messages, actions, onEdit }: { messages: Message[] | undefined; actions: MessageActions; onEdit: (text: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const el = scroller.current
    if (!el || !content.current) return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content.current)
    observer.observe(el)
    return () => observer.disconnect()
  }, [messages === undefined])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stick.current = bottom
    setAtBottom(bottom)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-2">
        {!messages ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div ref={content} className="flex flex-col gap-6 pb-2">
            {messages.map((m, i) =>
              m.role === 'user' ? <UserMessage key={m.id} message={m} onEdit={onEdit} /> : <AssistantMessage key={m.id} message={m} actions={actions} isLast={i === messages.length - 1} mode={m.mode} />,
            )}
          </div>
        )}
      </div>
      {!atBottom && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-2 left-1/2 size-8 -translate-x-1/2 rounded-full shadow-sm"
          aria-label="Scroll to bottom"
          onClick={() => {
            const el = scroller.current
            if (!el) return
            stick.current = true
            setAtBottom(true)
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
          }}
        >
          <ArrowDown />
        </Button>
      )}
    </div>
  )
}
