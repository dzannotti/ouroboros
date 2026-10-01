import type { Project } from '@shared/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

export function SettingsDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(project.name)
  const [instructions, setInstructions] = useState(project.instructions)
  useEffect(() => {
    if (!open) return
    setName(project.name)
    setInstructions(project.instructions)
  }, [open, project.name, project.instructions])
  const save = useMutation({
    mutationFn: () => api.updateProject(project.id, { name, instructions }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['project', project.id] })
      toast.success('Settings saved')
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) save.mutate()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
            <DialogDescription>Knowledge is shared with Ouroboros on every message in this project.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-knowledge">Knowledge</Label>
            <Textarea
              id="settings-knowledge"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={8000}
              className="min-h-40 text-sm"
              placeholder={'e.g. This is the website for Ember & Oak, a coffee roaster in Portland.\nAlways write copy in a warm, friendly tone. Prices are in EUR.'}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
