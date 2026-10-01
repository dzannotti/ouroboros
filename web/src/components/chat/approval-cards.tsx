import type { MigrationPart, SecretRequestPart } from '@shared/types'
import { Check, Database, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Decide = (id: string, approved: boolean, values?: Record<string, string>) => Promise<void>

const STATUS: Record<MigrationPart['status'], string> = { pending: 'Waiting for your approval', applied: 'Applied', rejected: 'Rejected', failed: 'Failed' }

export function MigrationCard({ part, onDecide }: { part: MigrationPart; onDecide?: Decide }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const pending = part.status === 'pending' && onDecide
  const decide = async (approved: boolean) => {
    setBusy(approved ? 'approve' : 'reject')
    try {
      await onDecide?.(part.id, approved)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border bg-card p-3', pending && 'border-selection')}>
      <div className="flex items-center gap-2 text-sm">
        <Database className="size-4 shrink-0" />
        <span className="font-medium">Database change</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{part.name}</span>
        <span className={cn('ml-auto shrink-0 text-xs', part.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{STATUS[part.status]}</span>
      </div>
      <Collapsible defaultOpen={part.status === 'pending'}>
        <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-2 hover:underline">Show SQL</CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{part.sql}</pre>
        </CollapsibleContent>
      </Collapsible>
      {part.error && <pre className="max-h-32 overflow-auto rounded-lg bg-destructive/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-destructive">{part.error}</pre>}
      {pending && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-pretty text-muted-foreground">Review the change. It runs on your app&apos;s database.</span>
          <Button variant="outline" size="sm" className="ml-auto" disabled={Boolean(busy)} onClick={() => void decide(false)}>
            {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />} Reject
          </Button>
          <Button size="sm" className="bg-selection text-selection-foreground hover:bg-selection/90" disabled={Boolean(busy)} onClick={() => void decide(true)}>
            {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
        </div>
      )}
    </div>
  )
}

export function SecretRequestCard({ part, onDecide }: { part: SecretRequestPart; onDecide?: Decide }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const pending = part.status === 'pending' && onDecide
  const submit = async (e: FormEvent, approved = true) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onDecide?.(part.id, approved, approved ? values : undefined)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={cn('flex flex-col gap-3 rounded-xl border bg-card p-3', pending && 'border-selection')}>
      <div className="flex items-center gap-2 text-sm">
        <KeyRound className="size-4 shrink-0" />
        <span className="font-medium">Secrets needed</span>
        <span className="ml-auto text-xs text-muted-foreground">{part.status === 'pending' ? 'Waiting for you' : part.status === 'provided' ? 'Saved' : 'Skipped'}</span>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{part.reason}</p>
      {pending ? (
        <>
          {part.names.map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              <Label htmlFor={`secret-${part.id}-${name}`} className="font-mono text-xs">
                {name}
              </Label>
              <Input id={`secret-${part.id}-${name}`} type="password" autoComplete="off" value={values[name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Stored securely; the AI never sees the values.
            </span>
            <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={(e) => void submit(e, false)}>
              Skip
            </Button>
            <Button type="submit" size="sm" className="bg-selection text-selection-foreground hover:bg-selection/90" disabled={busy || part.names.some((n) => !values[n]?.trim())}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {part.names.map((n) => (
            <span key={n} className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs">
              {n}
            </span>
          ))}
        </div>
      )}
    </form>
  )
}
