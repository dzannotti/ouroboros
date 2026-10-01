import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import CodeMirror from '@uiw/react-codemirror'
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useEffect, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Tree = { name: string; path: string; children?: Tree[] }

function buildTree(paths: string[]): Tree[] {
  const root: Tree = { name: '', path: '', children: [] }
  for (const p of paths) {
    let node = root
    p.split('/').forEach((part, i, all) => {
      const path = all.slice(0, i + 1).join('/')
      let child = node.children!.find((c) => c.name === part)
      if (!child) {
        child = i === all.length - 1 ? { name: part, path } : { name: part, path, children: [] }
        node.children!.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: Tree[]): Tree[] =>
    nodes
      .sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
  return sort(root.children!)
}

export function CodeView({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const { data: files } = useQuery({ queryKey: ['files', projectId], queryFn: () => api.files(projectId) })
  const visible = useMemo(() => (files ?? []).filter((f) => !f.startsWith('.ouroboros/') && f !== 'pnpm-lock.yaml'), [files])
  const tree = useMemo(() => buildTree(visible), [visible])
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set(['src', 'src/pages', 'src/components']))

  useEffect(() => {
    if (!selected && visible.length) setSelected(visible.find((f) => f === 'src/pages/Index.tsx') ?? visible.find((f) => f === 'src/App.tsx') ?? visible[0])
  }, [selected, visible])

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const render = (nodes: Tree[], depth: number) =>
    nodes.map((n) =>
      n.children ? (
        <div key={n.path}>
          <button type="button" onClick={() => toggle(n.path)} className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs hover:bg-muted" style={{ paddingLeft: depth * 12 + 6 }}>
            <ChevronRight className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open.has(n.path) && 'rotate-90')} />
            {open.has(n.path) ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{n.name}</span>
          </button>
          {open.has(n.path) && render(n.children, depth + 1)}
        </div>
      ) : (
        <button
          key={n.path}
          type="button"
          onClick={() => setSelected(n.path)}
          className={cn('flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs hover:bg-muted', selected === n.path && 'bg-muted font-medium')}
          style={{ paddingLeft: depth * 12 + 22 }}
        >
          <File className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{n.name}</span>
        </button>
      ),
    )

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-60 shrink-0 overflow-y-auto border-r p-2" aria-label="Files">
        {files ? render(tree, 0) : <Skeleton className="h-40 w-full" />}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {selected && (
          <>
            <div className="flex h-9 shrink-0 items-center border-b px-3 font-mono text-xs text-muted-foreground">{selected}</div>
            <CodeFile projectId={projectId} path={selected} readOnly={readOnly} />
          </>
        )}
      </div>
    </div>
  )
}

function CodeFile({ projectId, path, readOnly }: { projectId: string; path: string; readOnly: boolean }) {
  const qc = useQueryClient()
  const { data: code, isLoading } = useQuery({ queryKey: ['file', projectId, path], queryFn: () => api.file(projectId, path) })
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const isDark = document.documentElement.classList.contains('dark') || dark
  const locked = readOnly || path.startsWith('.ouroboros/') || path === 'pnpm-lock.yaml'
  useEffect(() => setDraft(null), [path, code])

  const save = async () => {
    if (draft === null) return
    setSaving(true)
    try {
      await api.saveFile(projectId, path, draft)
      await qc.invalidateQueries({ queryKey: ['file', projectId, path] })
      toast.success('Saved')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || code === undefined) return <Skeleton className="m-3 h-40" />
  const ext = path.split('.').pop() ?? ''
  const extensions = /^(t|j)sx?$/.test(ext) ? [javascript({ jsx: true, typescript: ext.startsWith('t') })] : ext === 'css' ? [css()] : ext === 'html' ? [html()] : ext === 'json' ? [json()] : []
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {draft !== null && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Unsaved changes</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setDraft(null)}>
            Discard
          </Button>
          <Button size="sm" className="h-7" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-auto text-xs"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            void save()
          }
        }}
      >
        <CodeMirror
          value={draft ?? code}
          onChange={(v) => setDraft(v === code ? null : v)}
          extensions={extensions}
          editable={!locked}
          readOnly={locked}
          theme={isDark ? 'dark' : 'light'}
          basicSetup={{ foldGutter: false, highlightActiveLine: !locked }}
          className="h-full [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-transparent"
          height="100%"
        />
      </div>
    </div>
  )
}
