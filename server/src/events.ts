import type { ProjectEvent } from '../../shared/types.ts'

type Listener = (event: ProjectEvent) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribe(projectId: string, fn: Listener) {
  const set = listeners.get(projectId) ?? new Set()
  set.add(fn)
  listeners.set(projectId, set)
  return () => {
    set.delete(fn)
    if (!set.size) listeners.delete(projectId)
  }
}

export function publish(projectId: string, event: ProjectEvent) {
  listeners.get(projectId)?.forEach((fn) => fn(event))
}
