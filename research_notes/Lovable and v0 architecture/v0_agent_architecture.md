# Vercel v0 Agent / Model Architecture (public record, as of 2026-10-01)

Confidence legend: **[H]** = stated in Vercel primary source (blog/changelog/docs); **[M]** = credible secondary source or Vercel community forum; **[L]** = aggregator / unverified / inference.

## 1. The "composite model" (v0-1.0-md, v0-1.5-md/lg): base LLMs, RAG, Quick Edit, AutoFix, LLM Suspense

### Takeaway
v0's model is not a single LLM: it is a frontier base model (Anthropic Sonnet 3.7 -> Sonnet 4) wrapped with a retrieval step, a fast "Quick Edit" path for narrow edits, a custom RFT-trained fast fixer model (`vercel-autofixer-01`), and a deterministic stream-rewriting layer ("LLM Suspense") plus post-stream autofixers. The value is almost entirely in the pre/post-processing around a swappable base model, which is exactly the part a Qwen-based clone can reproduce.

### Cited Findings
- Composite model blog post published **June 1, 2025**; names `v0-1.0-md`, `v0-1.5-md`, `v0-1.5-lg`. [H] — [Vercel: v0 composite model family](https://vercel.com/blog/v0-composite-model-family)
- Base models: `v0-1.0-md` uses "Anthropic's Sonnet 3.7"; `v0-1.5-md` uses "Sonnet 4". [H] — [Vercel](https://vercel.com/blog/v0-composite-model-family)
- RAG step: v0 "retrieve[s] additional context based on your query from our own dataset, pulling from documentation, UI examples, your uploaded project sources, internal Vercel knowledge". [H] — [Vercel](https://vercel.com/blog/v0-composite-model-family)
- Quick Edit: "optimized for speed... optimal for tasks with narrow scope, like updating text, fixing syntax errors, or reordering components". [H] — [Vercel](https://vercel.com/blog/v0-composite-model-family)
- AutoFix model is `vercel-autofixer-01`, trained with **reinforcement fine-tuning (RFT) via Fireworks AI**, over "multiple training iterations". [H] — [Vercel](https://vercel.com/blog/v0-composite-model-family)
- AutoFix speed/quality benchmark (from the same post): `vercel-autofixer-01` **8,130.01 chars/sec, 86.14% error-free**; Gemini 2.5 Flash 559.05 chars/sec, 89.55%; GPT-4o-mini 238.9 chars/sec, 83.33%. I.e. ~15x faster than Gemini Flash for a ~3.4-pt quality cost. [H] — [Vercel](https://vercel.com/blog/v0-composite-model-family)
- Context windows: `v0-1.5-md` 128K, `v0-1.5-lg` 512K; beta Models API access announced **June 9, 2025**. [H] — [Vercel changelog: Models API v0-1.5 beta](https://vercel.com/changelog/models-api-v0-1.5-beta)
- "LLM Suspense" (named in the Jan 2026 post by Max Leiter): a framework that "manipulates text as it streams to the user", including "find-and-replace for cleaning up incorrect imports". [H] — [Vercel: How we made v0 an effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)
  - URL aliasing: long blob-storage URLs (hundreds of chars, "10s of tokens") are replaced by short aliases before the model call and restored after streaming. [H] — same
  - Icon correction: every lucide-react icon name is embedded in a vector DB; actual package exports are analyzed at runtime; if the model emits a non-existent icon, an embedding search picks the nearest real one and the import is rewritten mid-stream (example: `VercelLogo` -> `Triangle as VercelLogo`), "within 100 milliseconds and requires no further model calls". [H] — same
  - Import normalization (quoting/formatting variants) during streaming. [H] — same
- Post-stream **autofixers** handle multi-file / AST-level issues that Suspense can't: AST check that `useQuery`/`useMutation` are wrapped in `QueryClientProvider`; scanning generated code to deterministically complete `package.json` dependencies; repairing "common JSX or TypeScript errors". A "small, fast, fine tuned model trained on data from a large volume of real generations" decides e.g. where to place provider wrappers. Fixes "run in under 250 milliseconds and only when needed". [H] — same

### Inferences
- Architecture = (retrieve/inject) -> base LLM stream -> (streaming regex/embedding rewrites) -> (deterministic AST fixers + small fixer model). For a clone, the deterministic layers (icon/import/dependency fixing, URL aliasing) are model-agnostic and cheap; they likely matter *more* for a 35B local model than for Sonnet since smaller models hallucinate imports more. [L, inference]
- The fixer model runs at ~8K chars/sec, implying a small model on fast inference infra (Fireworks); a local analogue would be a small (1–8B) coder model fine-tuned on (broken, fixed) pairs, or simply a deterministic pass + typecheck. [L, inference]

### Gaps
- Base model for `v0-1.5-lg` is not confirmed in what I retrieved (commonly assumed Opus 4; unverified).
- No public detail on the Quick Edit model's identity/size or on how routing between Quick Edit and full model is decided.
- No public detail on the embedding model, chunking, or index used for RAG.
- Whether the 2026 "v0 Mini/Pro/Max" tiers are still Anthropic-based is not publicly stated in sources found.

## 2. Shift from v0.dev to v0.app agentic mode (2025–2026): loop, tools, sandbox, plan mode, skills, MCP

### Takeaway
August 11, 2025: v0.dev renamed to v0.app and turned into a tool-calling agent (web search, site inspection/screenshots, planning, task tracking, image concepts, integrations). February 2026: rebuilt around real repos (Git branches/PRs), a full editor, and previews running in Vercel Sandbox (Firecracker microVMs) instead of in-browser previews. August 5, 2026: v0 API GA exposes the agent headlessly (v2 API + MCP server), with Skills ("Design Systems 2.0") loadable per request.

### Cited Findings
- v0.app launch post dated **August 11, 2025**. Listed agent capabilities: web search ("handles failures, and returns results with citations"), site inspection ("Inspects live sites, takes screenshots, and summarizes findings"), error detection ("Spots errors, compares implementations"), planning ("Makes a step-by-step plan"), task management ("Tracks tasks, updates plans"), design generation ("Generates image concepts with descriptions"), file reading, integrations. No model/loop internals disclosed. [H] — [Vercel: v0.app](https://vercel.com/blog/v0-app)
- Rename explicitly marks shift "from a code generation tool to an agentic AI platform"; "describe and deliver" rather than "prompt and fix". [M] — [The New Stack](https://thenewstack.io/vercel-goes-all-in-on-vibe-coding-web-apps/); [TheLetterTwo](https://thelettertwo.com/2025/08/11/vercel-v0-update-expands-ai-agent-beyond-developers/)
- Vercel says it learned from Codex/Claude Code about the importance of tool calling. [M] — [The AI Economy](https://theaieconomy.substack.com/p/vercel-v0-agent-expands-beyond-developers)
- **Feb 4, 2026 "new v0"**: import any GitHub repo, v0 handles branching/commits, create/merge PRs in-app; Projects linked to deployments/env vars/domains; multiple chats per project; built-in VS Code-style editor; previews now run the full app (server code, API routes, DB connections, env vars) in **Vercel Sandbox**, replacing the prior browser-based preview. [M] — [v0 FAQ](https://v0.app/docs/faqs); [Vercel community thread](https://community.vercel.com/t/integrating-v0-with-existing-github-repositories-and-vercel-projects/34005)
- Vercel Sandbox GA **Jan 30, 2026**: each sandbox is a Firecracker microVM; "in production use by teams including v0, Blackbox AI and RooCode". [H] — [Vercel changelog: Sandboxes GA](https://vercel.com/changelog/vercel-sandboxes-ga)
- `Sandbox.create()` boots an Amazon Linux 2023 image with Node.js or Python; dedicated kernel per sandbox. [M] — [Vercel Sandbox docs](https://vercel.com/docs/sandbox.md) (via search snippet)
- **v0 API GA, Aug 5, 2026**: agent "can read, edit, and run the files" in a per-chat workspace; "starts a dev server" in a Vercel Sandbox and returns an embeddable preview URL; "verifies the code running in the Sandbox, so it can catch and fix errors in your app in real time". Streamed message "parts": "text, thinking, file reads and edits, searches, bash commands, tool calls, and agent actions". [H] — [Vercel: Introducing the new v0 API](https://vercel.com/blog/introducing-the-new-v0-api)
- MCP: v0 exposes an MCP server at `https://v0.app/api/mcp` (OAuth) with chat/message/preview tools; SDK `@v0-sdk/ai-tools` for AI SDK agents. [H] — same
- Skills: "Design Systems 2.0 saves a design system as a skill. Include it in a request to load its components, tokens, setup, and starter app"; up to 3 skills per request. [H] — same
- Plan Mode: invoked via a preset or "@Plan Mode"; agent outputs a plan (components to change, state storage, config, edge cases) and waits at an approval gate before spending credits/touching code. [M, community post 2026-01-08] — [Vercel Community: From Prompt to Plan](https://community.vercel.com/t/from-prompt-to-plan-building-with-intention-in-v0/31022)
- Jan 2026: Vercel launched an open agent-skills ecosystem (CLI to install skill packages) and a bash-tool integration giving agents filesystem + Bash in a sandbox. [L, search summary] — [Plushcap Vercel blog summaries Jan 2026](https://www.plushcap.com/companies/vercel/blog/summaries/2026/01)
- Vercel's own reference "v0 clone" guide (Sept 2026) uses OpenAI Agents API + Vercel Sandbox (`vercel/sandbox/node:24`, port 3000, 30-min timeout, network restricted to OpenAI + npm), files in `/workspace`, Next.js dev server on `0.0.0.0:3000`, preview saved once HTTP succeeds, build failures surfaced in chat. [H, but it's a sample, not v0 itself] — [Vercel KB: v0 clone with OpenAI Agents + Sandbox](https://vercel.com/kb/guide/v0-clone-openai-agents-vercel-sandbox)

### Inferences
- The current v0 is a Claude-Code-style loop (read/edit/bash/search tools + todo + plan) running against a real microVM, with the 2025 composite-model tricks (Suspense, autofixers) sitting in the stream path. [L, inference from the two blog posts]
- For a clone: a Firecracker/containers sandbox running `next dev` plus exposing tool events as typed "parts" matches the public v0 API shape well. [L]

### Gaps
- No primary source found describing v0's subagents, persistent memory implementation, context compaction, or exact tool schemas.
- No public info on which model(s) drive the agent loop post-2025 (v0 Mini/Pro/Max base models undisclosed in sources found).

## 3. Context strategy: file/doc selection, embeddings, compression

### Takeaway
Publicly described: embedding + keyword intent detection triggers injection of version-specific library docs into a *stable* system prompt (to preserve prompt-cache hits), plus hand-curated example code exposed as read-only filesystem directories the agent can read. Earlier (2025) composite model did RAG over docs, UI examples, user project sources, and internal Vercel knowledge.

### Cited Findings
- Dynamic system prompt uses "embeddings and keyword matching" to detect intent (e.g., AI-related), explicitly *instead of* web search (which risks stale results and hallucination via intermediate summarization); injects "knowledge... describing the targeted version of the SDK". [H] — [Vercel: effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)
- Injections kept "consistent" to "maximize prompt-cache hits and keep token usage low". [H] — same
- "Hand-curated directories with code samples designed for LLM consumption" in a **read-only filesystem**, built with the AI SDK team (patterns: image generation, routing, web-search tools). [H] — same
- 2025 RAG sources: documentation, UI examples, uploaded project sources, internal Vercel knowledge. [H] — [Vercel composite model](https://vercel.com/blog/v0-composite-model-family)
- URL aliasing in LLM Suspense doubles as token compression. [H] — [Vercel: effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)

### Inferences
- "Docs as read-only files the agent greps" is a cheaper and more cache-friendly design than per-turn RAG stuffing; well suited to local models with prefix caching (vLLM/llama.cpp). [L]

### Gaps
- No public detail on how user-repo files are selected for context in agent mode, or on history summarization/compaction.

## 4. Editing protocol and error reduction

### Takeaway
Publicly: streaming output is rewritten in-flight (imports, icons, URLs), then deterministic + small-model autofixers patch multi-file issues, and since 2026 the agent verifies in a live sandbox dev server. The exact edit format (full-file vs diff vs fast-apply) is not documented in primary sources.

### Cited Findings
- Quick Edit path for narrow-scope edits (text, syntax fixes, reordering). [H] — [Vercel composite](https://vercel.com/blog/v0-composite-model-family)
- Streaming find-and-replace of imports; icon import rewriting; dependency completion into `package.json`; AST provider-wrapping checks; JSX/TS fixes in <250ms. [H] — [Vercel: effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)
- Baseline: "code generated by LLMs can have errors as often as 10% of the time"; pipeline gives "a double-digit increase in success rates". [H] — same
- API message parts include "file reads and edits" and "bash commands" — i.e., edits are tool calls in agent mode. [H] — [Vercel: new v0 API](https://vercel.com/blog/introducing-the-new-v0-api)

### Inferences
- Leaked (unofficial) v0 system prompts circulating on GitHub describe a code-block/file protocol with "// ... existing code ..." placeholders merged by a fast-apply step; this is plausible but **unverified** and may be outdated. [L] — e.g. [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) (not fetched in this session)

### Gaps
- No primary source on diff format, fast-apply model, or whether tsc/eslint/build are run as explicit gates (only "verifies the code running in the Sandbox").

## 5. Error capture from preview and auto-fix loops

### Takeaway
Two layers: (a) in-stream/post-stream fixers (2025–Jan 2026 posts) and (b) runtime verification in the sandbox where the agent catches and fixes errors "in real time" (2026 API). Pre-2026 the v0.app agent also offered "error detection" as a tool.

### Cited Findings
- Agent "verifies the code running in the Sandbox, so it can catch and fix errors in your app in real time." [H] — [Vercel: new v0 API](https://vercel.com/blog/introducing-the-new-v0-api)
- v0.app agent "Spots errors, compares implementations, and reasons through results"; can take screenshots of sites. [H] — [Vercel: v0.app](https://vercel.com/blog/v0-app)
- Vercel's reference clone surfaces build failures in chat so the user can request a fix (not automatic). [H] — [Vercel KB clone guide](https://vercel.com/kb/guide/v0-clone-openai-agents-vercel-sandbox)

### Gaps
- No public description of how browser console/runtime errors are piped from the preview iframe to the agent, retry limits, or loop termination.

## 6. Design quality: inspiration, templates, shadcn, Design Mode

### Takeaway
Design quality levers publicly visible: image-concept generation and site inspection/screenshots for inspiration (2025 agent), design systems packaged as Skills (components, tokens, setup, starter app), and Design Mode — a visual editor that writes Tailwind edits back to code without spending AI tokens.

### Cited Findings
- Agent "Generates image concepts with descriptions based on prompts"; inspects live sites/screenshots. [H] — [Vercel: v0.app](https://vercel.com/blog/v0-app)
- Design Systems 2.0 as skills (components, tokens, setup, starter app), max 3 per request. [H] — [Vercel: new v0 API](https://vercel.com/blog/introducing-the-new-v0-api)
- Design Mode (discussion 2025-07-31): select element in preview; edit text, typography, padding/margins, colors (Tailwind palette + custom), delete; "immediately updates the code without using any AI tokens"; "Go to Code" jumps to source; pairs with CMD+K for scoped prompts. [M] — [Vercel Community: Edit UI with v0's design mode](https://community.vercel.com/t/edit-ui-with-v0s-design-mode/17477)
- 2026 Design Mode update: floating toolbar, drag handles for spacing/gaps, drag-to-reorder, Layers panel (component tree), Properties panel (fonts, colors, radius, shadows), annotation system that batches comments into one AI prompt; keyboard shortcuts. [L, aggregator] — [createwith.com](https://www.createwith.com/tool/v0/updates/v0-launches-design-mode-with-visual-editing-and-layer-management)

### Inferences
- Token-free visual edits imply a deterministic source mapping from DOM element -> JSX node (e.g., injected data attributes at build time) and Tailwind class rewriting. [L, inference]

### Gaps
- No primary source on shadcn registry integration internals or on any "design brief" generation step.

## 7. Evals and metrics

### Takeaway
Vercel publishes a single headline metric — error-free generation rate on an internal eval — plus fixer speed. No public eval suite.

### Cited Findings
- Error-free generation: `v0-1.5-md` 93.87%, `v0-1.5-lg` 89.80%, `claude-4-opus-20250514` 78.43%. [H] — [Vercel composite](https://vercel.com/blog/v0-composite-model-family)
- Fixer benchmark numbers (see section 1). [H] — same
- Primary metric: "the percentage of successful generations" (working site, not error/blank screen); LLM error rate up to ~10%; "double-digit increase in success rates". [H] — [Vercel: effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)

### Inferences
- Note the md model beat lg on error-free rate, suggesting the composite pipeline dominates base-model size for this metric — encouraging for a 35B local base. [L]

### Gaps
- Eval set composition, size, and grading procedure are not public.

## 8. v0 Platform API / Model API

### Takeaway
Two generations: (1) 2025 OpenAI-compatible **Models API** serving `v0-1.0-md`/`v0-1.5-md`/`v0-1.5-lg` (chat-completions style, vision + tools); (2) Aug 2026 **v0 API v2** — a headless agent API (chats, streams, sandbox previews, deploy) with tiered models v0 Mini/Pro/Max/Max Fast. The old model-API docs URL now 404s (`vercel.com/docs/v0/model-api` -> `v0.app/docs/model-api` 404), suggesting deprecation/relocation.

### Cited Findings
- `v0-1.5-md`: 128K context, up to 32K output, $3/$15 per 1M in/out tokens; supports attachments, reasoning, tool calling, image input, system messages (OpenAI-compatible). [L, third-party model directories] — [Maxim Bifrost model library](https://www.getmaxim.ai/bifrost/model-library/compare/v0/v0-1.5-md); [TypingMind](https://custom.typingmind.com/tools/estimate-llm-usage-costs/vercel/v0-1-5-md)
- `v0-1.5-lg` 512K context. [H] — [Vercel changelog](https://vercel.com/changelog/models-api-v0-1.5-beta)
- Docs page for Model API redirects `vercel.com/docs/v0/model-api` -> `v0.app/docs/model-api`, which returned 404 on 2026-10-01. [H, observed] — [v0.app/docs/model-api](https://v0.app/docs/model-api)
- v0 API v2 base `https://api.v0.dev/v2`, OpenAPI at `https://api.v0.dev/v2/openapi/json`; MCP at `https://v0.app/api/mcp`. [H] — [Vercel: new v0 API](https://vercel.com/blog/introducing-the-new-v0-api)
- Modes `chats.create` (blocking), `createAsync` (poll/webhook), `createStream` (ordered parts); `chats.createFromRepo` (GitHub/ZIP/files); `chats.createVercelProject`, `chats.deploy`; short-lived preview tokens proxied server-side. [M] — [Developers Digest](https://www.developersdigest.tech/blog/vercel-v0-api-ga-2026)
- Model tiers/pricing per 1M tokens in/out: v0 Mini $0.20/$1.20, Pro $2/$10, Max $5/$25, Max Fast $10/$50. [M] — [Developers Digest](https://www.developersdigest.tech/blog/vercel-v0-api-ga-2026) (cites [v0 pricing](https://v0.app/pricing))

### Gaps
- Could not confirm current status of the OpenAI-compatible `/v1/chat/completions` endpoint (docs 404). Base models behind Mini/Pro/Max not disclosed.
