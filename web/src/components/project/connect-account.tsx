import type { Connection, DeployProvider } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

export const PROVIDERS: Record<DeployProvider, { name: string; purpose: string; tokenUrl: string; tokenHint: string }> = {
  vercel: { name: 'Vercel', purpose: 'Hosts your app on the internet', tokenUrl: 'https://vercel.com/account/settings/tokens', tokenHint: 'Create a token with access to all projects, then paste it here.' },
  supabase: { name: 'Supabase', purpose: 'Runs the database, sign-in and files', tokenUrl: 'https://supabase.com/dashboard/account/tokens', tokenHint: 'Generate a new token, then paste it here.' },
}

export function useConnections() {
  return useQuery({ queryKey: ['connections'], queryFn: api.connections })
}

/** One provider: shows the connected account, or lets the user connect with one click (OAuth) or by pasting a token. */
export function ConnectAccount({ provider, connection, oauth }: { provider: DeployProvider; connection?: Connection; oauth: boolean }) {
  const qc = useQueryClient()
  const info = PROVIDERS[provider]
  const [pasting, setPasting] = useState(false)
  const [token, setToken] = useState('')
  const save = useMutation({
    mutationFn: () => api.connect(provider, token),
    onSuccess: ({ account }) => {
      toast.success(`Connected ${info.name} as ${account}`)
      setPasting(false)
      setToken('')
      void qc.invalidateQueries({ queryKey: ['connections'] })
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: () => api.disconnect(provider),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connections'] }),
    onError: (err) => toast.error(err.message),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (token.trim()) save.mutate()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{info.name}</span>
          <span className="truncate text-xs text-muted-foreground">{connection ? `Connected as ${connection.account}` : info.purpose}</span>
        </div>
        {connection ? (
          <>
            <Check className="size-4 text-muted-foreground" aria-hidden />
            <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Disconnect
            </Button>
          </>
        ) : oauth ? (
          <Button size="sm" asChild>
            <a href={api.connectUrl(provider)}>Connect</a>
          </Button>
        ) : (
          !pasting && (
            <Button size="sm" onClick={() => setPasting(true)}>
              Connect
            </Button>
          )
        )}
      </div>
      {!connection && !oauth && pasting && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            <a href={info.tokenUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">
              Open {info.name} tokens <ExternalLink className="size-3" />
            </a>{' '}
            · {info.tokenHint}
          </p>
          <div className="flex gap-2">
            <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={`${info.name} token`} aria-label={`${info.name} token`} autoFocus />
            <Button type="submit" size="sm" className="h-9" disabled={!token.trim() || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export function ConnectionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: connections } = useConnections()
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connected accounts</DialogTitle>
          <DialogDescription>Publishing puts your apps on the internet using your own accounts. Only you can use them.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {(['vercel', 'supabase'] as const).map((p) => (
            <ConnectAccount key={p} provider={p} connection={connections?.find((c) => c.provider === p)} oauth={config?.oauth[p] ?? false} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
