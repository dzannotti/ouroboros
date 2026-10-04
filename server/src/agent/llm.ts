import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import { config } from "../config.ts";

export const llm = new OpenAI({
  baseURL: config.ai.baseUrl,
  apiKey: config.ai.apiKey || "missing",
  maxRetries: 2,
  timeout: 10 * 60_000,
});

const caller = new AsyncLocalStorage<string | null>();

/** Runs `fn` so that every model call it makes, directly or in follow-up work, is attributed to this user's email. */
export const asUser = <T>(email: string | null, fn: () => T): T =>
  caller.run(email, fn);

/** Per-request headers naming the user behind the current turn (AI_USER_HEADER); empty when unset or the user has no email. */
export function userHeaders(
  header = config.ai.userHeader,
): Record<string, string> {
  const email = caller.getStore();
  return header && email && /^[\x21-\x7e]+$/.test(email)
    ? { [header]: email }
    : {};
}

/**
 * Bills one generated image to the user behind the current turn: an image request to the gateway naming the price list
 * entry (COMFY_BILLING_MODEL) and the megapixels drawn. Nothing is generated there. A no-op when billing is not configured.
 */
export async function billImage(width: number, height: number, model = config.comfy.billingModel): Promise<void> {
  if (!model) return;
  const res = await fetch(`${config.ai.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.ai.apiKey}`,
      ...userHeaders(),
    },
    body: JSON.stringify({ model, prompt: model, metadata: { units: (width * height) / 1_000_000 } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`The gateway returned ${res.status} when billing ${model}`);
}

export async function embed(input: string[]): Promise<number[][]> {
  if (!config.ai.embeddingModel)
    throw new Error("Embeddings are not configured (AI_EMBEDDING_MODEL)");
  const res = await llm.embeddings.create(
    { model: config.ai.embeddingModel, input },
    { headers: userHeaders() },
  );
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function complete(
  model: string,
  system: string,
  user: string,
  maxTokens = 4000,
): Promise<string> {
  const res = await llm.chat.completions.create(
    {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { headers: userHeaders() },
  );
  return res.choices[0]?.message?.content?.trim() ?? "";
}
