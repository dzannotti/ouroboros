import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

export type ModelInfo = { id: string; label: string; description: string }

/** AI_MODELS="model-id:Label:Short description,other-id:Other" — otherwise discovered from the endpoint (see discoverModels). */
export const models: ModelInfo[] = (process.env.AI_MODELS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [id, label, ...description] = entry.split(':')
    return { id, label: label || id, description: description.join(':') }
  })

export const config = {
  root,
  port: Number(process.env.PORT ?? 8787),
  previewPort: Number(process.env.PREVIEW_PORT ?? 8788),
  previewUrl: process.env.PREVIEW_URL,
  dataDir: path.resolve(root, process.env.DATA_DIR ?? 'data'),
  templateDir: path.join(root, 'template'),
  webDist: path.join(root, 'web/dist'),
  databaseUrl: process.env.DATABASE_URL,
  databaseReadOnly: process.env.DB_READONLY === '1',
  sandboxImage: process.env.SANDBOX_IMAGE ?? 'localhost/ouroboros-sandbox:latest',
  sandboxIdleMinutes: Number(process.env.SANDBOX_IDLE_MINUTES ?? 20),
  ai: {
    baseUrl: (process.env.AI_BASE_URL ?? 'http://localhost:4000/v1').replace(/\/$/, ''),
    apiKey: process.env.AI_API_KEY ?? '',
    get defaultModel(): string {
      const wanted = [process.env.AI_DEFAULT_MODEL, discoveredDefault].find((id) => models.some((m) => m.id === id))
      return wanted ?? models[0]?.id ?? process.env.AI_DEFAULT_MODEL ?? ''
    },
    maxSteps: Number(process.env.AI_MAX_STEPS ?? 300),
    contextBudget: Number(process.env.AI_CONTEXT_BUDGET ?? 170_000),
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? '',
    userHeader: process.env.AI_USER_HEADER?.trim() || undefined,
    reasoningEffort: (['low', 'medium', 'high'] as const).find((e) => e === process.env.AI_REASONING_EFFORT),
  },
  comfy: {
    url: (process.env.COMFY_URL ?? '').replace(/\/$/, ''),
    model: process.env.COMFY_MODEL ?? 'z_image_turbo_bf16.safetensors',
    textEncoder: process.env.COMFY_TEXT_ENCODER ?? 'qwen_3_4b.safetensors',
    vae: process.env.COMFY_VAE ?? 'ae.safetensors',
  },
  devUser: process.env.AUTH_DEV_USER ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev'),
  publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, ''),
  auth: {
    mode: (process.env.AUTH_MODE ?? (process.env.OIDC_ISSUER ? 'oidc' : process.env.TRUSTED_PROXIES ? 'header' : 'dev')) as 'oidc' | 'header' | 'dev',
    sessionSecret: process.env.SESSION_SECRET ?? '',
    sessionHours: Number(process.env.SESSION_HOURS ?? 168),
    trustedProxies: (process.env.TRUSTED_PROXIES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    roleClaim: process.env.OIDC_ROLE_CLAIM ?? 'ouroboros_role',
    adminGroup: process.env.OIDC_ADMIN_GROUP ?? 'svc-ouroboros-admin',
    userGroup: process.env.OIDC_USER_GROUP ?? 'svc-ouroboros-user',
    defaultRole: (process.env.OIDC_DEFAULT_ROLE ?? 'none') as 'admin' | 'user' | 'none',
    oidc: {
      issuer: process.env.OIDC_ISSUER ?? '',
      clientId: process.env.OIDC_CLIENT_ID ?? '',
      clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
      scopes: process.env.OIDC_SCOPES ?? 'openid profile email ouroboros_role',
      allowHttp: process.env.OIDC_ALLOW_HTTP === '1',
    },
  },
}

export const projectDir = (id: string) => path.join(config.dataDir, 'projects', id)

type Listed = { id: string; mode?: string }
type Described = { model_name?: string; model_info?: { mode?: string; ouroboros?: { label?: unknown; description?: unknown; default?: unknown; hidden?: unknown } } }

const NOT_CHAT = /embed|rerank|whisper|tts|image|vision-only/i
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Builds the picker list from an OpenAI-style /models listing, enriched by LiteLLM's /model/info when available.
 * In LiteLLM, add `model_info: { ouroboros: { label, description, default: true, hidden: true } }` to a model to control how it appears.
 */
export function discoverModels(listed: Listed[], described: Described[] = []): { models: ModelInfo[]; defaultId?: string } {
  const info = new Map(described.map((d) => [d.model_name, d.model_info]))
  const found: ModelInfo[] = []
  let defaultId: string | undefined
  for (const m of listed) {
    const meta = info.get(m.id)
    const mode = m.mode ?? meta?.mode
    if (mode ? mode !== 'chat' : NOT_CHAT.test(m.id)) continue
    const extra = meta?.ouroboros
    if (extra?.hidden === true || found.some((f) => f.id === m.id)) continue
    found.push({ id: m.id, label: text(extra?.label) || m.id, description: text(extra?.description) })
    if (extra?.default === true) defaultId ??= m.id
  }
  return { models: found, defaultId }
}

const fromEnv = models.length > 0
let discoveredDefault: string | undefined

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${config.ai.apiKey}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${res.status} from ${url}`)
  return (await res.json()) as T
}

/** Loads the model list from the endpoint unless AI_MODELS pins it. Safe to call again: a failed refresh keeps the previous list. */
export async function loadModels() {
  if (fromEnv) return
  try {
    const listed = await getJson<{ data?: Listed[] }>(`${config.ai.baseUrl}/models`)
    const described = await getJson<{ data?: Described[] }>(`${config.ai.baseUrl}/model/info`).catch(() => ({ data: [] }))
    const found = discoverModels(listed.data ?? [], described.data ?? [])
    if (found.models.length) {
      models.splice(0, models.length, ...found.models)
      discoveredDefault = found.defaultId
    }
  } catch (err) {
    console.warn(`[ouroboros] could not list models from ${config.ai.baseUrl}:`, (err as Error).message)
  }
  if (!models.length) console.warn('[ouroboros] no models configured — set AI_MODELS')
}

export function startModelRefresh() {
  if (!fromEnv) setInterval(() => void loadModels(), 5 * 60_000).unref()
}
