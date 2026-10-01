import type { Message, ProjectEvent } from '@shared/types'
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ProjectDetail } from '@/lib/api'

type Listener = (event: ProjectEvent) => void
const listeners = new Set<Listener>()

export function onProjectEvent(fn: Listener) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

function apply(qc: QueryClient, id: string, events: ProjectEvent[]) {
  const messageEvents = events.filter((e) => e.type === 'message' || e.type === 'part' || e.type === 'delta' || e.type === 'status')
  if (messageEvents.length) {
    qc.setQueryData<Message[]>(['messages', id], (old = []) => {
      const list = [...old]
      for (const e of messageEvents) {
        if (e.type === 'message') {
          const i = list.findIndex((m) => m.id === e.message.id)
          if (i === -1) list.push(e.message)
          else list[i] = e.message
          continue
        }
        const i = list.findIndex((m) => m.id === e.messageId)
        if (i === -1) continue
        const msg = { ...list[i], parts: [...list[i].parts] }
        if (e.type === 'part') msg.parts[e.index] = e.part
        if (e.type === 'delta') {
          const part = msg.parts[e.index]
          if (part && (part.type === 'text' || part.type === 'reasoning')) msg.parts[e.index] = { ...part, text: part.text + e.text }
        }
        if (e.type === 'status') msg.status = e.status
        list[i] = msg
      }
      return list
    })
  }
  for (const e of events) {
    if (e.type === 'message' && e.message.role === 'assistant' && e.message.status === 'streaming') {
      qc.setQueryData<ProjectDetail>(['project', id], (p) => p && { ...p, running: e.message.id })
    }
    if (e.type === 'status') {
      qc.setQueryData<ProjectDetail>(['project', id], (p) => p && { ...p, running: null })
      void qc.invalidateQueries({ queryKey: ['messages', id] })
      void qc.invalidateQueries({ queryKey: ['files', id] })
    }
    if (e.type === 'project') {
      qc.setQueryData<ProjectDetail>(['project', id], (p) => p && { ...p, ...e.project, sandbox: p.sandbox })
      void qc.invalidateQueries({ queryKey: ['projects'] })
    }
    if (e.type === 'sandbox') qc.setQueryData(['sandbox', id], { status: e.status, error: e.error })
    if (e.type === 'versions') void qc.invalidateQueries({ queryKey: ['versions', id] })
    if (e.type === 'files') {
      void qc.invalidateQueries({ queryKey: ['files', id] })
      void qc.invalidateQueries({ queryKey: ['file', id] })
    }
    listeners.forEach((fn) => fn(e))
  }
}

export function useProjectEvents(id: string) {
  const qc = useQueryClient()
  useEffect(() => {
    let buffer: ProjectEvent[] = []
    let frame = 0
    const source = new EventSource(`/api/projects/${id}/events`)
    source.onmessage = (msg) => {
      buffer.push(JSON.parse(msg.data) as ProjectEvent)
      frame ||= requestAnimationFrame(() => {
        frame = 0
        const batch = buffer
        buffer = []
        apply(qc, id, batch)
      })
    }
    source.onopen = () => {
      void qc.invalidateQueries({ queryKey: ['messages', id] })
    }
    return () => {
      cancelAnimationFrame(frame)
      source.close()
    }
  }, [id, qc])
}

export function useSandbox(id: string, initial: ProjectDetail['sandbox'] | undefined) {
  const qc = useQueryClient()
  return useQuery({ queryKey: ['sandbox', id], queryFn: () => qc.getQueryData<ProjectDetail['sandbox']>(['sandbox', id]) ?? initial ?? { status: 'starting' as const }, enabled: Boolean(initial), staleTime: Infinity }).data
}
