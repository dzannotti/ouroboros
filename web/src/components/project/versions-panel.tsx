import type { Version } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck, Eye, FileDiff, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

type Props = { projectId: string; running: boolean; onRestore: (sha: string) => void; onPreview: (sha: string) => void; onClose: () => void }

export function VersionsPanel({ projectId, running, onRestore, onPreview }: Props) {
  const { data: versions } = useQuery({ queryKey: ['versions', projectId], queryFn: () => api.versions(projectId) })
  const [confirm, setConfirm] = useState<Version | null>(null)
  const [diff, setDiff] = useState<Version | null>(null)
  const lastGood = versions?.find((v) => v.good)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1 px-4 pb-3">
        <h2 className="font-medium">Version history</h2>
        <p className="text-xs text-pretty text-muted-foreground">Every change is saved as a version. Restoring brings back that version&apos;s code; database data is not changed.</p>
        {lastGood && !lastGood.current && (
          <Button variant="outline" size="sm" className="mt-2 self-start" disabled={running} onClick={() => setConfirm(lastGood)}>
            <CircleCheck /> Go back to last working version
          </Button>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!versions
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mx-2 my-2 h-12" />)
          : versions.map((v, i) => (
              <li key={v.sha} className={cn('group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60', v.current && 'bg-muted/60')}>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-medium">{versions.length - i}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{v.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {timeAgo(v.createdAt)}
                    {v.current && <span className="rounded bg-background px-1.5 py-px font-medium text-foreground">Current</span>}
                    {v.good && (
                      <span className="flex items-center gap-1">
                        <CircleCheck className="size-3" /> Working
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  {i < versions.length - 1 && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label="View changes" onClick={() => setDiff(v)}>
                      <FileDiff />
                    </Button>
                  )}
                  {!v.current && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label="Preview this version" onClick={() => onPreview(v.sha)}>
                      <Eye />
                    </Button>
                  )}
                  {!v.current && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label="Restore this version" disabled={running} onClick={() => setConfirm(v)}>
                      <RotateCcw />
                    </Button>
                  )}
                </div>
              </li>
            ))}
      </ol>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirm?.title}” will become the current version. Nothing is lost — you can restore any later version again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onRestore(confirm.sha)
                setConfirm(null)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DiffDialog projectId={projectId} version={diff} onClose={() => setDiff(null)} />
    </div>
  )
}

export function DiffDialog({ projectId, version, onClose }: { projectId: string; version: Version | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['diff', projectId, version?.sha], queryFn: () => api.diff(projectId, version!.sha), enabled: Boolean(version) })
  return (
    <Dialog open={Boolean(version)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{version?.title}</DialogTitle>
        </DialogHeader>
        <pre className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {data?.split('\n').map((line, i) => (
            <div
              key={i}
              className={cn(
                line.startsWith('+') && !line.startsWith('+++') && 'bg-primary/10 text-foreground',
                line.startsWith('-') && !line.startsWith('---') && 'bg-destructive/10 text-destructive',
                (line.startsWith('diff ') || line.startsWith('@@')) && 'text-muted-foreground',
              )}
            >
              {line || ' '}
            </div>
          )) ?? 'Loading…'}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
