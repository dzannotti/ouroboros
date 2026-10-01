import type { Message, Part, ReasoningPart, ToolPart, VersionPart } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Brain,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Copy,
  Database,
  KeyRound,
  Ellipsis,
  Eye,
  FileCode2,
  FileDiff,
  FilePen,
  FilePlus2,
  FileX2,
  FolderTree,
  Globe,
  Hammer,
  ImageIcon,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Package,
  Palette,
  Pencil,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Timer,
  Undo2,
  X,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { duration } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Markdown } from './markdown'
import { MigrationCard, SecretRequestCard } from './approval-cards'
import { QuestionCard } from './question-card'

export type MessageActions = {
  onRetry?: () => void
  onRestore?: (sha: string) => void
  onDiff?: (sha: string, title: string) => void
  onPreview?: (sha: string) => void
  onUndo?: () => void
  onAnswer?: (text: string) => void
  onImplementPlan?: () => void
  onContinue?: () => void
  versionNumber?: (sha: string) => number | undefined
  currentSha?: string
  assetUrl?: (path: string) => string
  onDecide?: (id: string, approved: boolean, values?: Record<string, string>) => Promise<void>
}

export function UserMessage({ message, onEdit }: { message: Message; onEdit?: (text: string) => void }) {
  const text = message.parts.find((p) => p.type === 'text')?.text
  const images = message.parts.filter((p) => p.type === 'image')
  const elements = message.parts.flatMap((p) => (p.type === 'elements' ? p.elements : []))
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })
  return (
    <div className="group/user flex flex-col items-end gap-1.5 pl-10">
      {message.authorName && me && message.authorId !== me.id && <span className="px-1 text-xs text-muted-foreground">{message.authorName}</span>}
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((img) => (
            <a key={img.url} href={img.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-xl border bg-muted">
              <img src={img.url} alt={img.name} className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {elements.map((el, i) => (
        <span key={el.oid} className="flex max-w-full items-center gap-1 rounded-md border border-selection/30 bg-selection/5 px-1.5 py-0.5 font-mono text-xs text-foreground">
          <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-selection text-[9px] font-semibold text-selection-foreground">{i + 1}</span>
          <span className="truncate">{el.oid.split(':')[0]}</span>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          {el.tag}
        </span>
      ))}
      {text && <div className="max-w-full rounded-2xl bg-muted px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">{text}</div>}
      {text && onEdit && (
        <div className="flex opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
          <MiniAction label="Edit and send again" onClick={() => onEdit(text)}>
            <Pencil />
          </MiniAction>
          <MiniAction
            label="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(text)
              toast.success('Copied')
            }}
          >
            <Copy />
          </MiniAction>
        </div>
      )}
    </div>
  )
}

type StepPart = ToolPart | ReasoningPart
type Block = { kind: 'steps'; parts: StepPart[] } | { kind: 'part'; part: Part; index: number }

function blocks(parts: Part[]): Block[] {
  const out: Block[] = []
  parts.forEach((part, index) => {
    if (part.type === 'tool' || part.type === 'reasoning') {
      const last = out.at(-1)
      if (last?.kind === 'steps') last.parts.push(part)
      else out.push({ kind: 'steps', parts: [part] })
    } else if (part.type === 'text' && !part.text.trim()) {
      return
    } else if (part.type !== 'suggestions') out.push({ kind: 'part', part, index })
  })
  return out
}

export function AssistantMessage({ message, actions, isLast, mode }: { message: Message; actions: MessageActions; isLast: boolean; mode?: 'build' | 'plan' }) {
  const streaming = message.status === 'streaming'
  const list = blocks(message.parts)
  const text = message.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n\n')
  const lastPart = message.parts.at(-1)
  const waiting = streaming && (!lastPart || lastPart.type === 'version' || (lastPart.type === 'check' && lastPart.status !== 'running') || (lastPart.type === 'tool' && lastPart.status !== 'running'))
  const version = message.parts.find((p): p is VersionPart => p.type === 'version')
  const tools = message.parts.filter((p): p is ToolPart => p.type === 'tool')
  const changed = new Set(tools.filter((t) => ['write_file', 'edit_file', 'delete_file', 'generate_image'].includes(t.name) && t.status === 'done').map((t) => t.args.path))
  const isPlan = mode === 'plan' || (/^##\s*Plan/im.test(text) && !version)

  return (
    <div className="group/msg flex flex-col gap-2.5">
      {list.map((block, i) =>
        block.kind === 'steps' ? (
          <Steps key={`s${i}`} parts={block.parts} live={streaming && i === list.length - 1} assetUrl={actions.assetUrl} />
        ) : (
          <PartView key={block.index} part={block.part} actions={actions} isLast={isLast} />
        ),
      )}
      {waiting && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="shimmer">Working…</span>
        </div>
      )}
      {isPlan && /##\s*Plan/i.test(text) && isLast && !streaming && actions.onImplementPlan && (
        <div className="flex items-center gap-2 rounded-xl border border-selection/40 p-3">
          <ListChecks className="size-4 shrink-0 text-selection" />
          <span className="text-sm">Ready to build this plan?</span>
          <Button size="sm" className="ml-auto bg-selection text-selection-foreground hover:bg-selection/90" onClick={actions.onImplementPlan}>
            <Hammer /> Implement plan
          </Button>
        </div>
      )}
      {!streaming && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {message.durationMs ? (
            <Collapsible className="min-w-0">
              <CollapsibleTrigger className="group/w flex items-center gap-1.5 rounded-md py-1 pr-1.5 hover:text-foreground">
                <Timer className="size-3.5" />
                Worked for {duration(message.durationMs)}
                <ChevronRight className="size-3 transition-transform group-data-[state=open]/w:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-1 grid w-56 grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border p-2.5 font-mono text-[11px]">
                  <dt className="font-sans">Steps</dt>
                  <dd className="text-right text-foreground">{tools.length}</dd>
                  <dt className="font-sans">Files changed</dt>
                  <dd className="text-right text-foreground">{changed.size}</dd>
                  <dt className="font-sans">Time</dt>
                  <dd className="text-right text-foreground">{duration(message.durationMs)}</dd>
                </dl>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {message.status === 'stopped' && <span className="py-1">Stopped</span>}
          <div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
            {text && (
              <MiniAction
                label="Copy"
                onClick={() => {
                  void navigator.clipboard.writeText(text)
                  toast.success('Copied')
                }}
              >
                <Copy />
              </MiniAction>
            )}
            {isLast && version && actions.onUndo && version.sha === actions.currentSha && (
              <MiniAction label="Undo these changes" onClick={actions.onUndo}>
                <Undo2 />
              </MiniAction>
            )}
            {isLast && actions.onRetry && (
              <MiniAction label="Retry" onClick={actions.onRetry}>
                <RotateCcw />
              </MiniAction>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const ICONS: Record<string, typeof FileCode2> = {
  read_file: FileCode2,
  write_file: FilePlus2,
  edit_file: FilePen,
  delete_file: FileX2,
  rename_file: FilePen,
  list_files: FolderTree,
  search_files: Search,
  add_dependency: Package,
  remove_dependency: Package,
  run_command: Terminal,
  read_logs: ScrollText,
  check_project: ShieldCheck,
  fetch_url: Globe,
  generate_design_brief: Palette,
  generate_image: ImageIcon,
  screenshot: Eye,
  update_plan: ListChecks,
  enable_backend: Database,
  run_migration: Database,
  get_database_schema: Database,
  query_database: Database,
  security_scan: ShieldCheck,
  request_secrets: KeyRound,
  read_function_logs: ScrollText,
  ask_user: MessageCircleQuestion,
}

const FILE_TOOLS = ['write_file', 'edit_file']

type Row = ToolPart | { type: 'thought'; parts: ReasoningPart[] }

function rowsOf(parts: StepPart[]): Row[] {
  const rows: Row[] = []
  for (const p of parts) {
    const last = rows.at(-1)
    if (p.type === 'reasoning') {
      if (last?.type === 'thought') last.parts.push(p)
      else rows.push({ type: 'thought', parts: [p] })
      continue
    }
    const prev = [...rows].reverse().find((r): r is ToolPart => r.type === 'tool')
    const samePath = prev && FILE_TOOLS.includes(prev.name) && FILE_TOOLS.includes(p.name) && prev.args.path === p.args.path && prev === rows.findLast((r) => r.type === 'tool')
    if (samePath && prev) {
      const i = rows.indexOf(prev)
      rows[i] = { ...p, label: prev.label, summary: p.status === 'error' ? p.summary : undefined, result: [prev.result, p.result].filter(Boolean).join('\n') }
    } else rows.push(p)
  }
  return rows
}

function Steps({ parts, live, assetUrl }: { parts: StepPart[]; live: boolean; assetUrl?: (path: string) => string }) {
  const [expanded, setExpanded] = useState(false)
  const rows = rowsOf(parts)
  const hidden = !live && !expanded && rows.length > 8 ? rows.length - 5 : 0
  const shown = hidden ? rows.slice(-5) : rows
  const images = parts.filter((t): t is ToolPart => t.type === 'tool' && t.name === 'generate_image' && t.status === 'done' && typeof t.args.path === 'string')

  return (
    <div className="flex flex-col">
      <ol className="relative flex flex-col gap-0.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-[7px] before:w-px before:bg-border">
        {hidden > 0 && (
          <li>
            <button type="button" onClick={() => setExpanded(true)} className="relative flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground hover:text-foreground">
              <span className="flex size-[15px] items-center justify-center bg-background">
                <Ellipsis className="size-3.5" />
              </span>
              {hidden} more steps
            </button>
          </li>
        )}
        {shown.map((r, i) => (r.type === 'thought' ? <ThoughtRow key={`t${i}`} parts={r.parts} live={live && r === rows.at(-1)} /> : <ToolRow key={r.id} part={r} />))}
      </ol>
      {assetUrl && images.length > 0 && (
        <div className="mt-2 ml-6 flex flex-wrap gap-2">
          {images.map((t) => (
            <img key={t.id} src={assetUrl(t.args.path as string)} alt={String(t.args.prompt ?? '')} className="h-20 rounded-lg border object-cover" loading="lazy" />
          ))}
        </div>
      )}
    </div>
  )
}

function StepShell({ icon, children, details, tone }: { icon: ReactNode; children: ReactNode; details?: ReactNode; tone?: 'error' }) {
  const row = (
    <span className={cn('relative flex min-w-0 items-center gap-2 py-0.5 text-[13px] text-muted-foreground', tone === 'error' && 'text-destructive')}>
      <span className="flex size-[15px] shrink-0 items-center justify-center bg-background [&_svg]:size-3.5">{icon}</span>
      {children}
    </span>
  )
  if (!details) return <li>{row}</li>
  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger className="group/s flex w-full min-w-0 items-center text-left">
          {row}
          <ChevronRight className="ml-1 size-3 shrink-0 text-muted-foreground opacity-0 transition group-hover/s:opacity-100 group-data-[state=open]/s:rotate-90 group-data-[state=open]/s:opacity-100" />
        </CollapsibleTrigger>
        <CollapsibleContent>{details}</CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function ThoughtRow({ parts, live }: { parts: ReasoningPart[]; live: boolean }) {
  const thinking = live && parts.at(-1)?.durationMs === undefined
  const ms = parts.reduce((n, t) => n + (t.durationMs ?? 0), 0)
  const text = parts.map((t) => t.text.trim()).filter(Boolean).join('\n\n')
  if (!thinking && !text) return null
  return (
    <StepShell icon={<Brain />} details={text ? <p className="mt-1 mb-1.5 ml-[23px] max-h-72 overflow-y-auto border-l pl-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{text}</p> : undefined}>
      <span className={cn(thinking && 'shimmer')}>{thinking ? 'Thinking…' : `Thought for ${duration(ms)}`}</span>
    </StepShell>
  )
}

const pastLabel = (part: ToolPart) => {
  const path = typeof part.args.path === 'string' ? part.args.path.split('/').pop() : ''
  if (part.status === 'running') return part.label
  switch (part.name) {
    case 'read_file':
      return `Read ${path}`
    case 'write_file':
      return part.result?.startsWith('Created') ? `Created ${path}` : `Wrote ${path}`
    case 'edit_file':
      return `Edited ${path}`
    case 'delete_file':
      return `Deleted ${path}`
    case 'generate_image':
      return `Generated ${path}`
    case 'check_project':
      return part.status === 'error' ? 'Found type errors' : 'No issues found'
    default:
      return part.label
  }
}

function ToolRow({ part }: { part: ToolPart }) {
  const Icon = ICONS[part.name] ?? Terminal
  const fullPath = typeof part.args.path === 'string' ? part.args.path : null
  const stat = part.summary && /^[+-]\d+ lines$/.test(part.summary) ? part.summary.replace(' lines', '') : null
  return (
    <StepShell
      tone={part.status === 'error' ? 'error' : undefined}
      icon={part.status === 'running' ? <Loader2 className="animate-spin" /> : part.status === 'error' ? <X /> : <Icon />}
      details={
        part.result ? (
          <pre className="mt-1 mb-1.5 ml-[23px] max-h-56 overflow-auto rounded-lg border bg-muted/50 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {fullPath && <span className="mb-1 block text-foreground">{fullPath}</span>}
            {part.result}
          </pre>
        ) : undefined
      }
    >
      <span className={cn('truncate', part.status === 'running' && 'shimmer')}>{pastLabel(part)}</span>
      {stat && <span className={cn('shrink-0 font-mono text-[11px]', stat.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>{stat}</span>}
    </StepShell>
  )
}

function VersionCard({ part, actions }: { part: VersionPart; actions: MessageActions }) {
  const n = actions.versionNumber?.(part.sha)
  const current = actions.currentSha === part.sha
  const files = (part.files ?? []).filter((f) => !f.startsWith('.ouroboros/'))
  return (
    <Collapsible className={cn('rounded-lg border bg-card text-sm', current && 'border-selection ring-1 ring-selection/30')}>
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
        <CollapsibleTrigger className="group/v flex min-w-0 flex-1 items-center gap-1.5 text-left" disabled={!files.length}>
          <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/v:rotate-90', !files.length && 'opacity-0')} />
          <span className="truncate font-medium">{part.title}</span>
        </CollapsibleTrigger>
        {n && <span className="shrink-0 font-mono text-xs text-muted-foreground">v{n}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="Version actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!current && actions.onPreview && (
              <DropdownMenuItem onSelect={() => actions.onPreview?.(part.sha)}>
                <Eye /> Preview this version
              </DropdownMenuItem>
            )}
            {actions.onDiff && (
              <DropdownMenuItem onSelect={() => actions.onDiff?.(part.sha, part.title)}>
                <FileDiff /> View changes
              </DropdownMenuItem>
            )}
            {!current && actions.onRestore && (
              <DropdownMenuItem onSelect={() => actions.onRestore?.(part.sha)}>
                <RotateCcw /> Restore this version
              </DropdownMenuItem>
            )}
            {current && <DropdownMenuItem disabled>Current version</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {files.length > 0 && (
        <CollapsibleContent>
          <ul className="flex flex-col gap-1 border-t px-3 py-2">
            {files.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs">
                <CircleCheck className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono">{f}</span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

function PartView({ part, actions, isLast }: { part: Part; actions: MessageActions; isLast: boolean }) {
  switch (part.type) {
    case 'text':
      return <Markdown text={part.text} />
    case 'check':
      return (
        <ol>
          <StepShell
            tone={part.status === 'failed' ? 'error' : undefined}
            icon={part.status === 'running' ? <Loader2 className="animate-spin" /> : part.status === 'passed' ? <Check /> : <ShieldAlert />}
            details={part.details ? <pre className="mt-1 mb-1.5 ml-[23px] max-h-56 overflow-auto rounded-lg border bg-muted/50 p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{part.details}</pre> : undefined}
          >
            <span className={cn(part.status === 'running' && 'shimmer')}>{part.label}</span>
          </StepShell>
        </ol>
      )
    case 'version':
      return <VersionCard part={part} actions={actions} />
    case 'plan':
      return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="size-4" /> Tasks
          </span>
          <ul className="flex flex-col gap-1.5">
            {part.tasks.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {t.status === 'done' ? (
                  <CircleCheck className="size-4 shrink-0 text-selection" />
                ) : t.status === 'in_progress' ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(t.status === 'done' && 'text-muted-foreground')}>{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'migration':
      return <MigrationCard part={part} onDecide={actions.onDecide} />
    case 'secret-request':
      return <SecretRequestCard part={part} onDecide={actions.onDecide} />
    case 'paused':
      return (
        <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
          <Timer className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-pretty">Paused after {part.steps} steps so you can check the progress.</span>
          {isLast && actions.onContinue && (
            <Button size="sm" className="ml-auto shrink-0" onClick={actions.onContinue}>
              Continue
            </Button>
          )}
        </div>
      )
    case 'question':
      return <QuestionCard part={part} onAnswer={isLast && !part.answered ? actions.onAnswer : undefined} />
    case 'error':
      return (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex flex-1 flex-col gap-2">
            <span>{part.message}</span>
            {isLast && actions.onRetry && (
              <Button variant="outline" size="sm" className="self-start" onClick={actions.onRetry}>
                <RotateCcw /> Try again
              </Button>
            )}
          </div>
        </div>
      )
    default:
      return null
  }
}
