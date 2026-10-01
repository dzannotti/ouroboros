import OpenAI from 'openai'
import { config } from '../config.ts'

export const llm = new OpenAI({ baseURL: config.ai.baseUrl, apiKey: config.ai.apiKey || 'missing', maxRetries: 2, timeout: 10 * 60_000 })

export async function embed(input: string[]): Promise<number[][]> {
  if (!config.ai.embeddingModel) throw new Error('Embeddings are not configured (AI_EMBEDDING_MODEL)')
  const res = await llm.embeddings.create({ model: config.ai.embeddingModel, input })
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

export async function complete(model: string, system: string, user: string, maxTokens = 4000): Promise<string> {
  const res = await llm.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}
