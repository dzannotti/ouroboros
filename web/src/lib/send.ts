import type { Draft } from '@/components/chat/composer'
import { api, type SendInput } from '@/lib/api'

export async function draftToInput(projectId: string, draft: Draft, extra: Partial<SendInput> = {}): Promise<SendInput> {
  const images = await Promise.all(draft.files.map((f) => api.upload(projectId, f)))
  return { text: draft.text, mode: draft.mode, model: draft.model, images, ...extra }
}
