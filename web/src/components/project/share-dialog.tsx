import type { Project, ShareAccess, Sharing } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

type Level = ShareAccess | 'none'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

function AccessSelect({ value, onChange, label, none }: { value: Level; onChange: (v: Level) => void; label: string; none: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Level)}>
      <SelectTrigger size="sm" className="w-32 shrink-0" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="none">{none}</SelectItem>
        <SelectItem value="view">Can view</SelectItem>
        <SelectItem value="edit">Can edit</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function ShareDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const key = ['sharing', project.id]
  const { data } = useQuery({ queryKey: key, queryFn: () => api.sharing(project.id), enabled: open })
  const save = useMutation({
    mutationFn: (next: Pick<Sharing, 'everyone' | 'members'>) => api.setSharing(project.id, next),
    onMutate: (next) => qc.setQueryData<Sharing>(key, (prev) => prev && { ...prev, ...next }),
    onSuccess: (saved) => qc.setQueryData(key, saved),
    onError: (err) => {
      toast.error(err.message)
      void qc.invalidateQueries({ queryKey: key })
    },
  })
  const setMember = (userId: string, level: Level) => {
    if (!data) return
    const members = data.members.filter((m) => m.userId !== userId)
    if (level !== 'none') members.push({ userId, access: level })
    save.mutate({ everyone: data.everyone, members })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share “{project.name}”</DialogTitle>
          <DialogDescription>People who can view see the chat and the preview, and can remix. People who can edit can also chat and make changes.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-2 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
                <Users className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">Everyone</span>
              <AccessSelect label="Access for everyone" none="No access" value={data.everyone ?? 'none'} onChange={(v) => save.mutate({ everyone: v === 'none' ? null : v, members: data.members })} />
            </div>
            {data.people.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Nobody else has signed in to Ouroboros yet.</p>}
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {data.people.map((person) => (
                <div key={person.id} className="flex items-center gap-3 px-2 py-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{person.name}</span>
                    {person.email && <span className="truncate text-xs text-muted-foreground">{person.email}</span>}
                  </span>
                  <AccessSelect
                    label={`Access for ${person.name}`}
                    none={data.everyone ? `Same as everyone` : 'No access'}
                    value={data.members.find((m) => m.userId === person.id)?.access ?? 'none'}
                    onChange={(v) => setMember(person.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
