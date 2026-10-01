type Decision = { approved: boolean; values?: Record<string, string> }

const pending = new Map<string, { projectId: string; resolve: (d: Decision) => void }>()

export function wait(projectId: string, id: string, signal: AbortSignal, timeoutMs = 30 * 60_000): Promise<Decision> {
  return new Promise((resolve) => {
    const done = (d: Decision) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      pending.delete(id)
      resolve(d)
    }
    const onAbort = () => done({ approved: false })
    const timer = setTimeout(() => done({ approved: false }), timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    pending.set(id, { projectId, resolve: done })
  })
}

export function decide(projectId: string, id: string, decision: Decision): boolean {
  const entry = pending.get(id)
  if (!entry || entry.projectId !== projectId) return false
  entry.resolve(decision)
  return true
}
