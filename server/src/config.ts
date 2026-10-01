import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

export type ModelInfo = { id: string; label: string; description: string }

/** AI_MODELS="model-id:Label:Short description,other-id:Other" — otherwise discovered from the endpoint at startup. */
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
      return process.env.AI_DEFAULT_MODEL ?? models[0]?.id ?? ''
    },
    maxSteps: Number(process.env.AI_MAX_STEPS ?? 300),
    contextBudget: Number(process.env.AI_CONTEXT_BUDGET ?? 170_000),
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? '',
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

export async function loadModels() {
  if (models.length) return
  try {
    const res = await fetch(`${config.ai.baseUrl}/models`, { headers: { authorization: `Bearer ${config.ai.apiKey}` }, signal: AbortSignal.timeout(10_000) })
    const body = (await res.json()) as { data?: { id: string }[] }
    for (const m of body.data ?? []) if (!/embed|rerank|whisper|tts|image|vision-only/i.test(m.id)) models.push({ id: m.id, label: m.id, description: '' })
  } catch (err) {
    console.warn(`[ouroboros] could not list models from ${config.ai.baseUrl}:`, (err as Error).message)
  }
  if (!models.length) console.warn('[ouroboros] no models configured — set AI_MODELS')
}
