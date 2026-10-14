import type { Project } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, ExternalLink, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { ConnectAccount, useConnections } from './connect-account'

export function usePublish(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sha?: string) => api.publish(projectId, sha),
    onSuccess: (d) => qc.setQueryData(['deployment', projectId], d),
    onError: (err) => toast.error(err.message),
  })
}

export function PublishButton({ project }: { project: Project }) {
  const { data: deployment } = useQuery({ queryKey: ['deployment', project.id], queryFn: () => api.deployment(project.id) })
  const { data: connections } = useConnections()
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
  const publish = usePublish(project.id)
  const needed = project.backend ? (['vercel', 'supabase'] as const) : (['vercel'] as const)
  const missing = needed.filter((p) => !connections?.some((c) => c.provider === p))
  const busy = deployment?.status === 'running' || publish.isPending
  const live = deployment?.url

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          {busy ? <Loader2 className="animate-spin" /> : <Globe />}
          {busy ? 'Publishing…' : 'Publish'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{live ? 'Your app is live' : 'Put your app on the internet'}</span>
          <span className="text-xs text-muted-foreground">
            {live
              ? `Published ${deployment?.deployedAt ? timeAgo(deployment.deployedAt) : ''}. Publishing again updates the same address${project.backend ? ' and keeps the live data' : ''}.`
              : project.backend
                ? 'Your app is hosted on Vercel and its data moves to Supabase. Your current data is copied over the first time.'
                : 'Your app gets its own address on Vercel that anyone can open.'}
          </span>
        </div>

        {live && (
          <a href={live} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{live.replace(/^https:\/\//, '')}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        )}

        {missing.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">First, connect {missing.length === 2 ? 'these accounts' : 'this account'} (one time only):</span>
            {missing.map((p) => (
              <ConnectAccount key={p} provider={p} oauth={config?.oauth[p] ?? false} />
            ))}
          </div>
        )}

        {deployment?.status === 'running' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="shimmer">{deployment.step ?? 'Working…'}</span>
          </div>
        )}
        {deployment?.status === 'error' && deployment.error && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive" role="alert">
            <CircleAlert className="size-3.5 shrink-0" />
            <span className="break-words">{deployment.error}</span>
          </div>
        )}

        <Button disabled={busy || missing.length > 0} onClick={() => publish.mutate(undefined)}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? 'Publishing…' : live ? 'Publish latest version' : 'Publish'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
