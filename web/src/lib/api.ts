import type { StyleChanges } from '@shared/styles'
import type { Message, ModelInfo, Project, SandboxStatus, SelectedElement, Sharing, Version } from '@shared/types'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  if (res.status === 401 && !location.pathname.startsWith('/auth')) {
    location.href = `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`
    return new Promise<T>(() => {})
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error ?? res.statusText, res.status)
  }
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export type ProjectDetail = Project & { sandbox: { status: SandboxStatus; error?: string }; running: string | null }
export type AppConfig = { models: ModelInfo[]; previewPort: number; previewUrl: string | null }
export type User = { id: string; name: string; email: string | null; role: 'admin' | 'user'; authMode: 'oidc' | 'header' | 'dev' }
export type TableInfo = { name: string; rls: boolean; rows: number; columns: { name: string; type: string; nullable: boolean; default: string | null }[]; policies: { name: string; command: string; roles: string[]; using: string | null; check: string | null }[] }
export type BackendInfo = { enabled: false } | { enabled: true; status: { status: string; error?: string }; tables: TableInfo[]; findings: { level: 'error' | 'warn' | 'info'; table: string; message: string }[]; secrets: { name: string; createdAt: string }[] }
export type SendInput = { text: string; images?: { url: string; name: string }[]; elements?: SelectedElement[]; mode?: 'build' | 'plan'; model?: string }

export const api = {
  me: () => request<User>('/me'),
  config: () => request<AppConfig>('/config'),
  projects: (everyone = false) => request<Project[]>(`/projects${everyone ? '?scope=all' : ''}`),
  createProject: (input: SendInput & { draft?: boolean }) => request<Project>('/projects', { method: 'POST', body: json(input) }),
  project: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  remix: (id: string) => request<Project>(`/projects/${id}/remix`, { method: 'POST' }),
  updateProject: (id: string, input: { name?: string; model?: string; instructions?: string }) => request<Project>(`/projects/${id}`, { method: 'PATCH', body: json(input) }),
  sharing: (id: string) => request<Sharing>(`/projects/${id}/sharing`),
  setSharing: (id: string, input: Pick<Sharing, 'everyone' | 'members'>) => request<Sharing>(`/projects/${id}/sharing`, { method: 'PUT', body: json(input) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  messages: (id: string) => request<Message[]>(`/projects/${id}/messages`),
  send: (id: string, input: SendInput) => request<Message>(`/projects/${id}/messages`, { method: 'POST', body: json(input) }),
  stop: (id: string) => request<void>(`/projects/${id}/stop`, { method: 'POST' }),
  files: (id: string) => request<string[]>(`/projects/${id}/files`),
  file: (id: string, path: string, sha?: string) => request<string>(`/projects/${id}/file?path=${encodeURIComponent(path)}${sha ? `&sha=${sha}` : ''}`),
  saveFile: (id: string, path: string, content: string) => request<{ sha: string | null }>(`/projects/${id}/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: json({ content }) }),
  versions: (id: string) => request<Version[]>(`/projects/${id}/versions`),
  diff: (id: string, sha: string) => request<string>(`/projects/${id}/versions/${sha}/diff`),
  previewVersion: (id: string, sha: string) => request<{ url: string }>(`/projects/${id}/versions/${sha}/preview`, { method: 'POST' }),
  restore: (id: string, sha: string) => request<{ sha: string | null }>(`/projects/${id}/versions/${sha}/restore`, { method: 'POST' }),
  restartSandbox: (id: string) => request<unknown>(`/projects/${id}/sandbox/restart`, { method: 'POST' }),
  previewLogs: (id: string, entries: { level: string; message: string }[]) => request<void>(`/projects/${id}/preview-logs`, { method: 'POST', body: json(entries) }),
  inspectElement: (id: string, oid: string) => request<{ file: string; texts: { id: number; value: string }[]; className: string | null; dynamicClass: boolean }>(`/projects/${id}/visual-edit?oid=${encodeURIComponent(oid)}`),
  visualEdit: (id: string, input: { oid: string; texts?: { id: number; value: string }[]; styles?: StyleChanges }) => request<{ file: string; changed: boolean }>(`/projects/${id}/visual-edit`, { method: 'POST', body: json(input) }),
  upload: async (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ url: string; name: string }>(`/projects/${id}/uploads`, { method: 'POST', body: form })
  },
  decide: (id: string, approvalId: string, input: { approved: boolean; values?: Record<string, string> }) => request<void>(`/projects/${id}/approvals/${approvalId}`, { method: 'POST', body: json(input) }),
  backend: (id: string) => request<BackendInfo>(`/projects/${id}/backend`),
  tableRows: (id: string, table: string) => request<Record<string, unknown>[]>(`/projects/${id}/backend/tables/${encodeURIComponent(table)}`),
  backendUsers: (id: string) => request<{ id: string; email: string; created_at: string; last_sign_in_at: string | null }[]>(`/projects/${id}/backend/users`),
  setSecret: (id: string, name: string, value: string) => request<void>(`/projects/${id}/backend/secrets/${name}`, { method: 'PUT', body: json({ value }) }),
  deleteSecret: (id: string, name: string) => request<void>(`/projects/${id}/backend/secrets/${name}`, { method: 'DELETE' }),
  downloadUrl: (id: string) => `/api/projects/${id}/download`,
}

export function previewOrigin(config: AppConfig | undefined) {
  if (config?.previewUrl) return config.previewUrl.replace(/\/$/, '')
  return `${location.protocol}//${location.hostname}:${config?.previewPort ?? 8788}`
}
