import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Database, Info, KeyRound, LayoutDashboard, Loader2, Plus, ShieldCheck, ShieldOff, Trash2, Users, Wand2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { onProjectEvent } from '@/hooks/use-project-events'
import { api, type TableInfo } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

type Section = 'overview' | 'database' | 'users' | 'secrets'

export function CloudView({ projectId, onAsk }: { projectId: string; onAsk: (text: string) => void }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['backend', projectId], queryFn: () => api.backend(projectId) })
  const [section, setSection] = useState<Section>('overview')

  useEffect(
    () =>
      onProjectEvent((e) => {
        if (e.type === 'status' || (e.type === 'part' && e.part.type === 'migration')) void qc.invalidateQueries({ queryKey: ['backend', projectId] })
      }),
    [qc, projectId],
  )

  if (isLoading) return <Skeleton className="m-4 h-40" />
  if (error) return <p className="p-6 text-sm text-destructive">{error.message}</p>
  if (!data?.enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Database className="size-6" />
        </span>
        <h2 className="text-lg font-semibold">No backend yet</h2>
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">Add a database, user accounts, file storage and server functions. Just describe what should be saved and Ouroboros sets it up.</p>
        <Button onClick={() => onAsk('Add a backend so the app can save its data and users can sign up and log in.')}>
          <Plus /> Add a backend
        </Button>
      </div>
    )
  }

  const nav: [Section, string, typeof Database][] = [
    ['overview', 'Overview', LayoutDashboard],
    ['database', 'Database', Database],
    ['users', 'Users', Users],
    ['secrets', 'Secrets', KeyRound],
  ]

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2" aria-label="Cloud sections">
        {nav.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', section === key && 'bg-muted font-medium')}
          >
            <Icon className="size-4 text-muted-foreground" />
            {label}
            {key === 'overview' && data.findings.some((f) => f.level === 'error') && <span className="ml-auto size-2 rounded-full bg-destructive" />}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">
        {section === 'overview' && <Overview tables={data.tables} findings={data.findings} onAsk={onAsk} />}
        {section === 'database' && <DatabaseSection projectId={projectId} tables={data.tables} />}
        {section === 'users' && <UsersSection projectId={projectId} />}
        {section === 'secrets' && <SecretsSection projectId={projectId} secrets={data.secrets} />}
      </div>
    </div>
  )
}

function Overview({ tables, findings, onAsk }: { tables: TableInfo[]; findings: { level: 'error' | 'warn' | 'info'; table: string; message: string }[]; onAsk: (t: string) => void }) {
  const problems = findings.filter((f) => f.level !== 'info')
  return (
    <div className="flex max-w-3xl flex-col gap-6 p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Tables" value={tables.length} />
        <Stat label="Protected by RLS" value={`${tables.filter((t) => t.rls).length}/${tables.length}`} />
        <Stat label="Security issues" value={problems.length} tone={problems.some((f) => f.level === 'error') ? 'error' : undefined} />
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Security</h2>
          {problems.length > 0 && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => onAsk(`Fix these database security issues:\n${problems.map((f) => `- ${f.message}`).join('\n')}`)}>
              <Wand2 /> Fix with AI
            </Button>
          )}
        </div>
        {findings.length ? (
          <ul className="flex flex-col gap-2">
            {findings.map((f, i) => (
              <li key={i} className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', f.level === 'error' && 'border-destructive/40 bg-destructive/5')}>
                {f.level === 'error' ? <ShieldOff className="mt-0.5 size-4 shrink-0 text-destructive" /> : f.level === 'warn' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="text-pretty">{f.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> No security issues found.
          </p>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'error' }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-2xl font-semibold tabular-nums', tone === 'error' && 'text-destructive')}>{value}</span>
    </div>
  )
}

function DatabaseSection({ projectId, tables }: { projectId: string; tables: TableInfo[] }) {
  const [selected, setSelected] = useState(tables[0]?.name)
  const table = tables.find((t) => t.name === selected)
  const { data: rows, isLoading } = useQuery({ queryKey: ['rows', projectId, selected], queryFn: () => api.tableRows(projectId, selected!), enabled: Boolean(selected) })
  if (!tables.length) return <p className="p-6 text-sm text-muted-foreground">No tables yet.</p>
  return (
    <div className="flex h-full min-h-0">
      <ul className="w-48 shrink-0 overflow-y-auto border-r p-2">
        {tables.map((t) => (
          <li key={t.name}>
            <button type="button" onClick={() => setSelected(t.name)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-muted', selected === t.name && 'bg-muted font-medium')}>
              <span className="truncate">{t.name}</span>
              {!t.rls && <ShieldOff className="ml-auto size-3.5 shrink-0 text-destructive" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1 overflow-auto">
        {isLoading || !table ? (
          <Skeleton className="m-4 h-32" />
        ) : rows?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((c) => (
                  <TableHead key={c.name} className="font-mono text-xs">
                    {c.name}
                    <span className="ml-1 font-normal text-muted-foreground">{c.type}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {table.columns.map((c) => (
                    <TableCell key={c.name} className="max-w-64 truncate font-mono text-xs">
                      {r[c.name] === null ? <span className="text-muted-foreground">NULL</span> : typeof r[c.name] === 'object' ? JSON.stringify(r[c.name]) : String(r[c.name])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">This table is empty.</p>
        )}
      </div>
    </div>
  )
}

function UsersSection({ projectId }: { projectId: string }) {
  const { data: users, isLoading } = useQuery({ queryKey: ['backend-users', projectId], queryFn: () => api.backendUsers(projectId) })
  if (isLoading) return <Skeleton className="m-4 h-32" />
  if (!users?.length) return <p className="p-6 text-sm text-muted-foreground">No users have signed up yet.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Signed up</TableHead>
          <TableHead>Last sign in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell>{u.email}</TableCell>
            <TableCell className="text-muted-foreground">{timeAgo(u.created_at)}</TableCell>
            <TableCell className="text-muted-foreground">{u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SecretsSection({ projectId, secrets }: { projectId: string; secrets: { name: string; createdAt: string }[] }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['backend', projectId] })
  const add = useMutation({
    mutationFn: () => api.setSecret(projectId, name.trim(), value),
    onSuccess: () => {
      setName('')
      setValue('')
      toast.success('Secret saved')
      void refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({ mutationFn: (n: string) => api.deleteSecret(projectId, n), onSuccess: () => void refresh(), onError: (err) => toast.error(err.message) })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (/^[A-Z][A-Z0-9_]*$/.test(name.trim()) && value.trim()) add.mutate()
    else toast.error('Use an UPPER_SNAKE_CASE name and a value')
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4 p-6">
      <p className="text-sm text-pretty text-muted-foreground">Secrets are available to server functions as environment variables. Values are never shown again or sent to the AI.</p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {secrets.length ? (
          secrets.map((s) => (
            <li key={s.name} className="flex items-center gap-3 px-3 py-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <span className="font-mono text-sm">{s.name}</span>
              <span className="text-xs text-muted-foreground">••••••••</span>
              <span className="ml-auto text-xs text-muted-foreground">{timeAgo(s.createdAt)}</span>
              <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete ${s.name}`} onClick={() => remove.mutate(s.name)}>
                <Trash2 />
              </Button>
            </li>
          ))
        ) : (
          <li className="px-3 py-3 text-sm text-muted-foreground">No secrets yet.</li>
        )}
      </ul>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input placeholder="NAME" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} className="w-48 font-mono" aria-label="Secret name" />
        <Input placeholder="Value" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className="min-w-48 flex-1" aria-label="Secret value" />
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  )
}
