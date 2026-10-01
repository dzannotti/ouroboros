import type { SelectedElement } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Check, ChevronDown, ImagePlus, Lightbulb, Loader2, MousePointerClick, Square, X } from 'lucide-react'
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Draft = { text: string; files: File[]; mode: 'build' | 'plan'; model: string }

type Props = {
  placeholder?: string
  model: string
  onModelChange: (model: string) => void
  onSubmit: (draft: Draft) => Promise<void> | void
  running?: boolean
  onStop?: () => void
  autoFocus?: boolean
  size?: 'lg' | 'md'
  elements?: SelectedElement[]
  onRemoveElement?: (oid: string) => void
  selecting?: boolean
  onToggleSelect?: () => void
  text?: string
  onTextChange?: (text: string) => void
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function Composer(props: Props) {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
  const [localText, setLocalText] = useState('')
  const text = props.text ?? localText
  const setText = props.onTextChange ?? setLocalText
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<'build' | 'plan'>('build')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const model = config?.models.find((m) => m.id === props.model) ?? config?.models[0]
  const canSend = (text.trim().length > 0 || (props.elements?.length ?? 0) > 0) && !busy

  const addFiles = (list: FileList | File[]) => {
    const images = [...list].filter((f) => IMAGE_TYPES.includes(f.type))
    if (images.length < [...list].length) toast.error('Only PNG, JPEG, WebP and GIF images are supported')
    const tooBig = images.filter((f) => f.size > 10 * 1024 * 1024)
    if (tooBig.length) toast.error('Images must be smaller than 10 MB')
    setFiles((prev) => [...prev, ...images.filter((f) => f.size <= 10 * 1024 * 1024)].slice(0, 5))
  }

  const submit = async () => {
    if (!canSend) return
    setBusy(true)
    try {
      await props.onSubmit({ text: text.trim(), files, mode, model: props.model })
      setText('')
      setFiles([])
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length) {
      e.preventDefault()
      addFiles(e.clipboardData.files)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card shadow-xs transition-colors focus-within:border-ring/60',
        dragging && 'border-primary bg-accent',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {(files.length > 0 || (props.elements?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {props.elements?.map((el, i) => (
            <span key={el.oid} className="flex max-w-56 items-center gap-1.5 rounded-lg border bg-muted py-1 pr-1 pl-1.5 text-xs">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{i + 1}</span>
              <span className="truncate font-mono">{`<${el.tag}>`}</span>
              <span className="truncate text-muted-foreground">{el.text}</span>
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => props.onRemoveElement?.(el.oid)} aria-label="Remove element">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="group relative size-14 overflow-hidden rounded-lg border bg-muted">
              <img src={URL.createObjectURL(f)} alt={f.name} className="size-full object-cover" />
              <button
                type="button"
                className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        autoFocus={props.autoFocus}
        placeholder={props.placeholder ?? (mode === 'plan' ? 'Ask a question or plan a feature…' : 'Ask Ouroboros to build…')}
        className={cn(
          'resize-none border-0 bg-transparent px-4 shadow-none focus-visible:ring-0 dark:bg-transparent',
          props.size === 'lg' ? 'min-h-28 pt-4 text-base md:text-base' : 'max-h-60 min-h-16 pt-3 text-sm',
        )}
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground" onClick={() => fileInput.current?.click()} aria-label="Attach image">
              <ImagePlus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attach image</TooltipContent>
        </Tooltip>
        {props.onToggleSelect && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={props.selecting ? 'secondary' : 'ghost'}
                size="icon"
                className={cn('size-8 rounded-lg', props.selecting ? 'text-foreground' : 'text-muted-foreground')}
                onClick={props.onToggleSelect}
                aria-label="Select element in preview"
                aria-pressed={props.selecting}
              >
                <MousePointerClick />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select an element to edit</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={mode === 'plan' ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('h-8 gap-1.5 rounded-lg px-2', mode === 'plan' ? 'text-foreground' : 'text-muted-foreground')}
              onClick={() => setMode((m) => (m === 'plan' ? 'build' : 'plan'))}
              aria-pressed={mode === 'plan'}
            >
              <Lightbulb />
              Plan
            </Button>
          </TooltipTrigger>
          <TooltipContent>Plan mode: discuss and plan without changing code</TooltipContent>
        </Tooltip>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 text-muted-foreground">
                {model?.label ?? 'Model'}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {config?.models.map((m) => (
                <DropdownMenuItem key={m.id} onSelect={() => props.onModelChange(m.id)} className="flex items-start gap-2">
                  <Check className={cn('mt-0.5', m.id === props.model ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex flex-col">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {props.running && (
            <Button type="button" variant="outline" size="icon" className="size-8 rounded-lg" onClick={props.onStop} aria-label="Stop">
              <Square className="fill-current" />
            </Button>
          )}
          {(!props.running || text.trim()) && (
            <Button type="button" size={props.running ? 'sm' : 'icon'} className={cn('h-8 rounded-lg', !props.running && 'w-8')} disabled={!canSend} onClick={() => void submit()} aria-label={props.running ? 'Queue' : 'Send'}>
              {busy ? <Loader2 className="animate-spin" /> : props.running ? 'Queue' : <ArrowUp />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
