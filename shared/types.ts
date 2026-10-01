export type ModelInfo = { id: string; label: string; description: string }

export type SelectedElement = {
  oid: string
  tag: string
  text: string
  className: string
  html?: string
  hasOnlyText?: boolean
  note?: string
}

export type Attachment = { name: string; url: string; mimeType: string }

export type TextPart = { type: 'text'; text: string }
export type ReasoningPart = { type: 'reasoning'; text: string; durationMs?: number }
export type ImagePart = { type: 'image'; url: string; name: string }
export type ElementPart = { type: 'elements'; elements: SelectedElement[] }
export type ToolPart = {
  type: 'tool'
  id: string
  name: string
  label: string
  status: 'running' | 'done' | 'error'
  args: Record<string, unknown>
  result?: string
  summary?: string
}
export type QuestionPart = {
  type: 'question'
  id: string
  questions: { question: string; options: { label: string; description?: string }[]; multiSelect?: boolean }[]
  answered?: boolean
}
export type PlanPart = { type: 'plan'; tasks: { title: string; status: 'pending' | 'in_progress' | 'done' }[] }
export type CheckPart = { type: 'check'; status: 'running' | 'passed' | 'failed'; label: string; details?: string }
export type MigrationPart = { type: 'migration'; id: string; name: string; sql: string; status: 'pending' | 'applied' | 'rejected' | 'failed'; error?: string }
export type SecretRequestPart = { type: 'secret-request'; id: string; names: string[]; reason: string; status: 'pending' | 'provided' | 'skipped' }
export type VersionPart = { type: 'version'; sha: string; title: string; files?: string[] }
export type ErrorPart = { type: 'error'; message: string }
export type SuggestionsPart = { type: 'suggestions'; items: string[] }
export type PausedPart = { type: 'paused'; steps: number }

export type Part =
  | TextPart
  | ReasoningPart
  | ImagePart
  | ElementPart
  | ToolPart
  | QuestionPart
  | PlanPart
  | CheckPart
  | MigrationPart
  | SecretRequestPart
  | VersionPart
  | ErrorPart
  | SuggestionsPart
  | PausedPart

export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped'

export type Message = {
  id: string
  projectId: string
  role: 'user' | 'assistant'
  parts: Part[]
  status: MessageStatus
  commitSha: string | null
  durationMs: number | null
  mode: ChatMode
  createdAt: string
}

export type Project = {
  id: string
  name: string
  model: string
  lastGoodCommit: string | null
  instructions: string
  backend: boolean
  createdAt: string
  updatedAt: string
  previewUrl: string
  ownerName?: string
  mine?: boolean
}

export type Version = { sha: string; title: string; createdAt: string; good: boolean; current: boolean }

export type SandboxStatus = 'stopped' | 'starting' | 'installing' | 'ready' | 'error'

export type ChatMode = 'build' | 'plan'

export type ProjectEvent =
  | { type: 'message'; message: Message }
  | { type: 'part'; messageId: string; index: number; part: Part }
  | { type: 'delta'; messageId: string; index: number; text: string }
  | { type: 'status'; messageId: string; status: MessageStatus }
  | { type: 'files'; paths: string[] }
  | { type: 'sandbox'; status: SandboxStatus; error?: string }
  | { type: 'project'; project: Project }
  | { type: 'versions' }
  | { type: 'log'; source: 'dev' | 'browser'; level: string; message: string; at: number }
