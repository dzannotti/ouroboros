import { config } from '../config.ts'

const workflow = (prompt: string, width: number, height: number, seed: number) => ({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: config.comfy.model, weight_dtype: 'default' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: config.comfy.textEncoder, type: 'lumina2' } },
  '3': { class_type: 'VAELoader', inputs: { vae_name: config.comfy.vae } },
  '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
  '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
  '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
  '7': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
  '8': {
    class_type: 'KSampler',
    inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 },
  },
  '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
  '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'ouroboros' } },
})

const snap = (n: number) => Math.min(1536, Math.max(512, Math.round(n / 16) * 16))

export async function generateImage(prompt: string, width: number, height: number, signal: AbortSignal): Promise<Buffer> {
  const base = config.comfy.url
  const res = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(prompt, snap(width), snap(height), Math.floor(Math.random() * 2 ** 31)) }),
    signal,
  })
  const queued = (await res.json()) as { prompt_id?: string; error?: { message?: string } }
  if (!queued.prompt_id) throw new Error(`Image generation failed: ${queued.error?.message ?? res.status}`)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000))
    signal.throwIfAborted()
    const history = (await (await fetch(`${base}/history/${queued.prompt_id}`, { signal })).json()) as Record<
      string,
      { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>; status?: { status_str?: string } }
    >
    const entry = history[queued.prompt_id]
    if (entry?.status?.status_str === 'error') throw new Error('Image generation failed on the image server')
    const image = entry?.outputs?.['10']?.images?.[0]
    if (image) {
      const view = await fetch(`${base}/view?${new URLSearchParams(image)}`, { signal })
      return Buffer.from(await view.arrayBuffer())
    }
  }
  throw new Error('Image generation timed out: the image service is busy. Do not retry this turn; use the stock photo fallback instead.')
}
