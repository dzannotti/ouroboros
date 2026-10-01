import { type StyleChanges, type StyleGroup, currentStyle } from '@shared/styles'
import type { SelectedElement } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { AlignCenter, AlignLeft, AlignRight, ArrowUp, ArrowUpLeft, Ban, Loader2, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const FONT_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl']
const WEIGHTS = [
  ['font-normal', 'Regular'],
  ['font-medium', 'Medium'],
  ['font-semibold', 'Semibold'],
  ['font-bold', 'Bold'],
]
const PADDING = ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-6', 'p-8', 'p-10', 'p-12', 'p-16']
const RADIUS = [
  ['rounded-none', 'None'],
  ['rounded-sm', 'Small'],
  ['rounded-md', 'Medium'],
  ['rounded-lg', 'Large'],
  ['rounded-xl', 'XL'],
  ['rounded-2xl', '2XL'],
  ['rounded-full', 'Full'],
]
const TEXT_COLORS = [
  ['text-foreground', 'bg-foreground'],
  ['text-muted-foreground', 'bg-muted-foreground'],
  ['text-primary', 'bg-primary'],
  ['text-primary-foreground', 'bg-primary-foreground'],
  ['text-destructive', 'bg-destructive'],
]
const BG_COLORS = [
  ['bg-transparent', 'bg-transparent'],
  ['bg-background', 'bg-background'],
  ['bg-card', 'bg-card'],
  ['bg-muted', 'bg-muted'],
  ['bg-accent', 'bg-accent'],
  ['bg-primary', 'bg-primary'],
  ['bg-secondary', 'bg-secondary'],
]

type Props = { projectId: string; element: SelectedElement; theme: Record<string, string>; disabled: boolean; onClose: () => void; onAsk: (text: string) => void; onParent: () => void }

export function ElementEditor({ projectId, element, theme, disabled, onClose, onAsk, onParent }: Props) {
  const [ask, setAsk] = useState('')
  const [texts, setTexts] = useState<Record<number, string>>({})
  const [styles, setStyles] = useState<StyleChanges>({})
  const [saving, setSaving] = useState(false)
  const { data: info, isLoading } = useQuery({ queryKey: ['element', projectId, element.oid], queryFn: () => api.inspectElement(projectId, element.oid), staleTime: 0 })
  const value = (group: StyleGroup) => (group in styles ? (styles[group] ?? undefined) : currentStyle(element.className, group))
  const set = (group: StyleGroup, v: string) => setStyles((prev) => ({ ...prev, [group]: v }))
  const changedTexts = (info?.texts ?? []).filter((t) => t.id in texts && texts[t.id] !== t.value).map((t) => ({ id: t.id, value: texts[t.id] }))
  const dirty = changedTexts.length > 0 || Object.keys(styles).length > 0
  const stylesLocked = info?.dynamicClass === true
  const [file, line] = element.oid.split(':')

  const save = async () => {
    setSaving(true)
    try {
      await api.visualEdit(projectId, { oid: element.oid, texts: changedTexts, styles: stylesLocked ? undefined : styles })
      toast.success('Saved')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute top-3 right-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-xl border bg-card shadow-lg">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-sm font-medium">{`<${element.tag}>`}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {file}:{line}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={onParent} aria-label="Select parent element" title="Select parent">
          <ArrowUpLeft />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close editor">
          <X />
        </Button>
      </div>
      <form
        className="flex items-center gap-1.5 border-b p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (ask.trim()) onAsk(ask.trim())
        }}
      >
        <Sparkles className="ml-1 size-4 shrink-0 text-selection" />
        <Input
          autoFocus
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={`Ask AI to change this ${element.tag === 'button' ? 'button' : 'element'}…`}
          className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          aria-label="Describe a change to this element"
        />
        <Button type="submit" size="icon" className="size-7 shrink-0" disabled={!ask.trim() || disabled} aria-label="Send to AI">
          <ArrowUp />
        </Button>
      </form>
      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        {isLoading ? (
          <Skeleton className="h-9" />
        ) : (
          info?.texts.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`ve-text-${t.id}`} className="text-xs text-muted-foreground">
                {info.texts.length > 1 ? `Text ${i + 1}` : 'Text'}
              </Label>
              {t.value.length > 40 ? (
                <Textarea id={`ve-text-${t.id}`} value={texts[t.id] ?? t.value} onChange={(e) => setTexts((p) => ({ ...p, [t.id]: e.target.value }))} className="min-h-16 text-sm" />
              ) : (
                <Input id={`ve-text-${t.id}`} value={texts[t.id] ?? t.value} onChange={(e) => setTexts((p) => ({ ...p, [t.id]: e.target.value }))} className="h-8 text-sm" />
              )}
            </div>
          ))
        )}
        {stylesLocked && <p className="text-xs text-pretty text-muted-foreground">This element&apos;s styles are computed in code — use the AI box above to restyle it.</p>}
        <fieldset disabled={stylesLocked} className="flex flex-col gap-4 disabled:opacity-50">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size">
            <Select value={value('fontSize')} onValueChange={(v) => set('fontSize', v)}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace('text-', '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Weight">
            <Select value={value('fontWeight')} onValueChange={(v) => set('fontWeight', v)}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {WEIGHTS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Alignment">
          <ToggleGroup type="single" variant="outline" size="sm" value={value('textAlign') ?? ''} onValueChange={(v) => v && set('textAlign', v)} className="w-full">
            <ToggleGroupItem value="text-left" aria-label="Align left" className="flex-1">
              <AlignLeft />
            </ToggleGroupItem>
            <ToggleGroupItem value="text-center" aria-label="Align center" className="flex-1">
              <AlignCenter />
            </ToggleGroupItem>
            <ToggleGroupItem value="text-right" aria-label="Align right" className="flex-1">
              <AlignRight />
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Text color">
          <Swatches options={TEXT_COLORS} theme={theme} value={value('textColor')} onChange={(v) => set('textColor', v)} />
        </Field>
        <Field label="Background">
          <Swatches options={BG_COLORS} theme={theme} value={value('bgColor')} onChange={(v) => set('bgColor', v)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Padding">
            <Select value={value('padding')} onValueChange={(v) => set('padding', v)}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {PADDING.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.replace('p-', '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Corners">
            <Select value={value('radius')} onValueChange={(v) => set('radius', v)}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {RADIUS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        </fieldset>
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <span className="text-xs text-muted-foreground">Direct edits don&apos;t use AI.</span>
        <Button size="sm" className="ml-auto" disabled={!dirty || saving || disabled} onClick={() => void save()}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Swatches({ options, theme, value, onChange }: { options: string[][]; theme: Record<string, string>; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, swatch]) => (
        <button
          key={v}
          type="button"
          title={v}
          aria-label={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn('size-7 rounded-full border-2 border-border p-0.5 transition-colors', value === v && 'border-ring')}
        >
          {swatch === 'bg-transparent' ? (
            <Ban className="size-full text-muted-foreground" />
          ) : (
            <span className={cn('block size-full rounded-full border', !theme[swatch.replace('bg-', '')] && swatch)} style={{ background: theme[swatch.replace('bg-', '')] || undefined }} />
          )}
        </button>
      ))}
    </div>
  )
}
