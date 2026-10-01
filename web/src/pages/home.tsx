import type { Project } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Ellipsis, Pencil, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Composer, type Draft } from '@/components/chat/composer'
import { Logo } from '@/components/logo'
import { RenameDialog } from '@/components/project/rename-dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { UserMenu } from '@/components/user-menu'
import { api } from '@/lib/api'
import { draftToInput } from '@/lib/send'
import { timeAgo } from '@/lib/time'

const SUGGESTIONS = [
  { label: 'Coffee shop landing page', prompt: 'A landing page for a neighborhood specialty coffee shop with menu, opening hours and a location section' },
  { label: 'Habit tracker', prompt: 'A habit tracker where I can add daily habits, check them off and see my streaks for the week' },
  { label: 'Personal portfolio', prompt: 'A minimal personal portfolio for a product designer with projects, about and contact sections' },
  { label: 'Budget dashboard', prompt: 'A personal budget dashboard with monthly spending by category, recent transactions and a chart' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })
  const [everyone, setEveryone] = useState(false)
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects', everyone], queryFn: () => api.projects(everyone) })
  const [model, setModel] = useState('')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'Ouroboros'
  }, [])

  const create = async (draft: Draft) => {
    const project = await api.createProject({ text: draft.text, model: model || config?.models[0]?.id, mode: draft.mode, draft: true })
    await api.send(project.id, await draftToInput(project.id, draft, { model: project.model }))
    void qc.invalidateQueries({ queryKey: ['projects'] })
    navigate(`/projects/${project.id}`)
  }

  const visible = (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center justify-between px-4 md:px-6">
        <Logo />
        <UserMenu />
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-16">
        <section className="flex w-full max-w-2xl flex-col items-center gap-6 pt-[12vh] pb-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">What do you want to build?</h1>
            <p className="text-pretty text-muted-foreground">Describe an app or website. Ouroboros builds it while you watch.</p>
          </div>
          <div className="w-full">
            <Composer size="lg" autoFocus model={model || config?.models[0]?.id || ''} onModelChange={setModel} onSubmit={create} text={text} onTextChange={setText} placeholder="Describe the app you want to create…" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s.label} variant="outline" size="sm" className="rounded-full text-muted-foreground" onClick={() => setText(s.prompt)}>
                {s.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="flex w-full max-w-6xl flex-col gap-4" aria-labelledby="projects-heading">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 id="projects-heading" className="text-lg font-semibold">
                {everyone ? 'All projects' : 'Your projects'}
              </h2>
              {me?.role === 'admin' && (
                <ToggleGroup type="single" size="sm" variant="outline" value={everyone ? 'all' : 'mine'} onValueChange={(v) => v && setEveryone(v === 'all')} aria-label="Whose projects">
                  <ToggleGroupItem value="mine" className="px-2.5 text-xs">
                    Mine
                  </ToggleGroupItem>
                  <ToggleGroupItem value="all" className="px-2.5 text-xs">
                    Everyone
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
            {(projects?.length ?? 0) > 6 && (
              <div className="relative w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className="pl-8" aria-label="Search projects" />
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
              ))}
            </div>
          ) : visible.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{query ? 'No projects match your search.' : 'No projects yet. Describe an app above to get started.'}</p>
          )}
        </section>
      </main>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      toast.success(`Deleted ${project.name}`)
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="group relative flex flex-col gap-2">
      <Link to={`/projects/${project.id}`} className="flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border bg-muted transition-colors group-hover:border-ring/40">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-background text-2xl font-semibold text-foreground shadow-xs">{project.name.slice(0, 1).toUpperCase()}</span>
          <img
            src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.updatedAt)}`}
            alt=""
            className="absolute inset-0 size-full object-cover object-top"
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
        <div className="flex flex-col px-1">
          <span className="truncate pr-8 text-sm font-medium">{project.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {project.mine === false && project.ownerName ? `${project.ownerName} · ` : ''}Edited {timeAgo(project.updatedAt)}
          </span>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="absolute right-0 bottom-1 size-7 text-muted-foreground" aria-label={`${project.name} options`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void api
                .remix(project.id)
                .then((p) => {
                  toast.success(`Created ${p.name}`)
                  void qc.invalidateQueries({ queryKey: ['projects'] })
                })
                .catch((err: Error) => toast.error(err.message))
            }
          >
            <Copy /> Remix
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog project={project} open={renaming} onOpenChange={setRenaming} />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the project, its files and its chat history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
