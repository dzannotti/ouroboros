# Lovable (lovable.dev) Agent / Model Architecture — Public Record

Research date: 2026-10-01. Confidence tags: [HIGH] = primary source (Lovable blog/docs, vendor case study); [MED] = leaked prompt (unofficial but widely corroborated) or secondary source; [LOW] = third-party/inference.
Note: WebFetch summaries were produced by a small model reading the page; exact numbers were cross-checked where possible but quotes should be re-verified before publication.

## 1. Which LLMs Lovable uses and how (routing, large vs small, fine-tunes)

### Takeaway
Lovable's builder agent is Claude-first (Sonnet 3.5 → Opus 4.5/4.6/4.7 → Opus 5.5), served via Anthropic API + Vertex + Bedrock behind an in-house load balancer; since 2025 it also offers/evaluates GPT-5.x and Gemini, and in 2026 it describes a "control plane" that assigns different parts of a build to different models, with faster/cheaper models for lighter work (subagents) and proprietary trained models for narrow jobs (routing, summarizing, commit messages).

### Cited Findings
- [HIGH] Claude case study: Claude 3.5 Sonnet was "the first model that made agents work"; Claude Opus 4.5 was "the next big step change in reliability on long-horizon tasks". Architecture quote: "We have a harness around a main agent that can use subagents to orchestrate tasks effectively, with the right models at each step." Also mentions continuous evaluation gates measuring system failures/broken outputs. — [Claude customer story](https://claude.com/customers/lovable)
- [HIGH] Model-launch posts show Claude as the frontier default across time: Opus 4.5 (Dec 2 2025), Opus 4.6 (Feb 5 2026), Opus 4.7 (Apr 17 2026), Opus 5.5 (Sep 22 2026); plus "GPT-5 Meets Lovable" (Aug 7 2025) and "Testing GPT-5.5 in early access" (Apr 24 2026). — [Lovable engineering blog index](https://lovable.dev/blog/engineering)
- [HIGH] GPT-5 post gives no technical detail; notes GPT-4 was the catalyst for GPT Engineer, Lovable's predecessor. — [GPT-5 Meets Lovable](https://lovable.dev/blog/gpt5-meets-lovable)
- [HIGH] "The model picker is a dead end" (Aug 11 2026): a control plane "assign[s] different parts of the build to different models instead of asking one model to own the whole thing"; Lovable trains proprietary models for "clearly defined jobs" — routing requests, summarizing responses, writing commit messages — running "through the same control plane as outside models". Measures whole-app outcome, not per-response speed: "A model can respond quickly and still be slow if it takes three times as many rounds to finish." Switching principle: "Recovery should change the thing that failed, whether that is the context, plan, tool, or model"; frequent mid-build model switching discouraged due to context loss. — [The model picker is a dead end](https://lovable.dev/blog/the-model-picker-is-a-dead-end)
- [HIGH] Subagents: "lighter work gets routed to faster, cheaper models". — [Introducing subagents](https://lovable.dev/blog/subagents-in-lovable)
- [HIGH] Inference routing infra (Mårten Wiman, Mar 4 2026): >1 billion tokens/minute at peak; capacity spread across Anthropic, Vertex, Bedrock; builds multiple fallback chains with providers sampled by capacity weight (no provider twice per chain); project-level affinity to keep prompt caching warm ("Prompt caching relies on consecutive requests being sent to the same provider"); availability score every 30 s = successes − 200×errors + 1, fed into a PID controller that adjusts provider availability; rate limits reasoned about in non-cached tokens. — [Routing Billions of Tokens per Minute](https://lovable.dev/blog/routing-billions-of-tokens-per-minute)
- [HIGH] Aug 5 2026 "Lovable + Cerebras" partnership post exists (infrastructure/fast inference); content not fetched. — [blog index](https://lovable.dev/blog/engineering)
- [MED] Image generation tool in leaked agent tools uses flux.schnell (<1000px) and flux.dev (hero images). — [Leaked Agent Tools.json (Sep 2025)](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Lovable)
- [MED] The generated-app "AI connector" (for end-user app features, not the builder) lists Claude models (Opus 5.5, Sonnet 5, Haiku 4.5 etc.) for apps created after May 13 2026, which use TanStack Start. — [Lovable docs: AI features](https://docs.lovable.dev/features/ai) (via search snippet only)

### Inferences
- Pattern to copy for a local setup: one strong model for the main build agent, a smaller/faster model for read-only exploration subagents and for "classifier" jobs (routing, summarization, commit messages, stuck-detection). With local Qwen ~35B, the "small" tier could be a 7–14B model.
- Prompt-cache affinity matters even locally (vLLM/SGLang prefix caching): pin a project's session to one server replica.

### Gaps
- No public statement of which exact model does which sub-step today (e.g., whether subagents use Haiku/Gemini Flash). Opus 5.5 post only says it is "one of the models Lovable now reaches for".
- No public details on the proprietary/fine-tuned models (base model, size, training data).
- 2024-era claims that a small model (e.g., GPT-4o-mini) pre-selected files: I found no primary source; treat as unverified.

## 2. Agent Mode vs Chat Mode; agent loop, tools, planning, parallel tool calls

### Takeaway
Lovable moved (June–July 2025) from a single-shot "write everything in one response" generator to a tool-using agent loop; by 2026 there are three modes — Build (autonomous, formerly Agent), Plan (investigate + editable plan approved before building), and Chat (discussion, no changes) — plus a workspace-level chat agent, project-level builder agents, and read-only subagents, all coordinated via an event-log "Agent Control Plane".

### Cited Findings
- [HIGH] Agent Mode beta (Jun 30 2025): "The default version of Lovable tries to do everything in one single step"; agent instead interprets request, explores codebase, identifies gaps, applies changes, auto-corrects, summarizes. Tools: codebase search, on-demand file read, log + network inspection, real-time web search, image generate/edit. Claimed ~90% reduction in build errors. Pricing moved from 1 credit/message to usage-based. — [Agent Mode beta](https://lovable.dev/blog/agent-mode-beta)
- [HIGH] Agent GA (Jul 23 2025, with $100M ARR): 91% reduction in errors on complex multi-step tasks; credit examples "Make button gray" 0.50, "Add authentication" 1.20, "landing page with images" 1.70. — [$100M ARR & Lovable Agent](https://lovable.dev/blog/agent)
- [HIGH] Current docs: Build mode "implements changes and verifies the outcome"; Chat mode discusses "without a plan or code changes"; Plan mode lets you "investigate and write a plan you edit and approve before building"; conversation carries across modes; visible task list shows step progress and files touched; follow-up messages during a run are picked up "at its next natural stopping point"; a single message can run "up to 10 hours"; no upfront credit estimate. — [Docs: Build/Agent mode](https://docs.lovable.dev/features/agent-mode)
- [HIGH] Subagents (May 27 2026): parallel, read-only workers (codebase exploration, web research), each with isolated context window, do not talk to each other, report back to main agent; "The one thing they can't do is change your code"; auto-activated, or user can say "use subagents". — [Subagents](https://lovable.dev/blog/subagents-in-lovable)
- [HIGH] Multi-agent internals (Rouzbeh Delavari, Sep 24 2026): workspace-level Chat Agent fans out to project-level Builder Agents (via `send_message_to_project`, parallel when several are issued in one turn); builders spawn subagents. Every conversation is an event log ("trajectory": UserMessage, tool events, IterationEnd, AgentDone) with git-like parent pointers so forking is free. Each agent has an Inbox (async messages) and a Trajectory; inbox messages admitted at iteration boundaries. "Context is always assembled from the trajectory" by walking backwards, allowing per-agent-type prompts. All inter-agent interaction = append to inbox + send activation. Agents suspend at iteration boundaries and resume on fresh nodes after deploys. — [Inside Chats: How Lovable's Agents Work Together](https://lovable.dev/blog/how-lovable-agents-work-together)
- [MED] Leaked Sep 2025 agent prompt: default to discussion/planning unless user uses action words ("implement", "create"...), but on the first message assume user wants code; "ALWAYS batch multiple independent operations"; "NEVER make sequential tool calls when they can be combined"; ask clarifying questions rather than guess. — [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [MED] Leaked tool set (Sep 2025): lov-view (default first 500 lines), lov-write, lov-line-replace, lov-rename, lov-delete, lov-copy, lov-search-files (regex + glob include/exclude), lov-add-dependency / lov-remove-dependency (package.json not directly editable), lov-download-to-repo, lov-fetch-website (markdown/html/screenshot), lov-read-console-logs, lov-read-network-requests, analytics--read_project_analytics, supabase--docs-search / docs-get, websearch--web_search, secrets--add/update_secret, imagegen--generate_image / edit_image, security--run_security_scan / get_security_scan_results / get_table_schema, stripe--enable_stripe, document--parse_document. — [Leaked Agent Tools.json](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Tools.json)
- [MED] Pre-agent (older) protocol: output was XML-ish tags in a single response — one `<lov-code>` block containing `<lov-write>` (complete file contents), `<lov-rename>`, `<lov-delete>`, `<lov-add-dependency>`, plus `<lov-thinking>`, `<lov-error>`, `<lov-success>`, and a `<useful-context>` section. — [older Lovable/Prompt.txt at commit e7c0788](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/e7c07887c7a2ca38591a8d216459553e557442e4/Lovable/Prompt.txt)

### Inferences
- Minimum viable clone: agent loop with ~10 tools (view, search, line-replace, write, delete/rename, add-dependency, read-console-logs, read-network-requests, web fetch/search, image gen) plus a plan/chat mode that simply withholds write tools.
- The event-log/trajectory model with iteration boundaries is a clean design for resumability and mid-run user messages.

### Gaps
- No public description of loop termination criteria, max iterations, or how the plan is represented/executed step-by-step.

## 3. Context strategy (file selection, useful-context, RAG, compression)

### Takeaway
Lovable pre-injects a "useful-context" section and a "current-code" block into the prompt so the agent avoids re-reading files, and the agent then uses regex search + ranged reads to pull more; there is no public evidence of embedding-based code RAG for the builder. Knowledge retrieval (a curated "Lovable Stack Overflow") uses a classifier→selector→synthesizer chain. Context is reconstructed from the trajectory log; subagents keep exploration out of the main context.

### Cited Findings
- [MED] Prompt: "Always check 'useful-context' section FIRST and the current-code block before using tools to view or search files... the given context may not suffice... don't hesitate to search across the codebase"; "If a file is not in your context ... you must read the file before writing to it". — [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [MED] Older prompt injected per-file warnings like "src/index.css is 101 lines long... consider asking you to refactor" — i.e., file contents + line counts were placed in context automatically. — [older Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/e7c07887c7a2ca38591a8d216459553e557442e4/Lovable/Prompt.txt)
- [HIGH] Context is assembled from the event trajectory by walking backwards; use-case-specific prompts per agent type. — [Inside Chats](https://lovable.dev/blog/how-lovable-agents-work-together)
- [HIGH] Subagents have isolated context windows and only report results to the main agent. — [Subagents](https://lovable.dev/blog/subagents-in-lovable)
- [HIGH] "Lovable Stack Overflow" (LSO): curated knowledge base of fixes for recurring problems, injected via a classifier-selector-synthesizer chain "without adding latency"; early results "5% reduction in stuck rates and a 2% higher publish rate"; stale entries pruned via drop-out A/B tests. — [We Gave Our Agent a Vent Tool](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool)
- [HIGH] Proprietary models used for "summarizing responses" (likely context compaction/summaries). — [The model picker is a dead end](https://lovable.dev/blog/the-model-picker-is-a-dead-end)
- [HIGH] Internal-engineering (not product) post notes "Quality degrades and cost grows with the context window" — about Lovable engineers' own Claude Code-style workflow, not the product harness. — [$85,000 in tokens later](https://lovable.dev/blog/85000-in-tokens-later-scaling-agentic-coding-at-lovable)

### Inferences
- How "useful-context" is chosen is not public; plausibly a cheap model or heuristic (recently edited files, files referenced in errors, imports of mentioned components). For a local clone: always inject index.css, tailwind.config.ts, App.tsx/routes, and last-edited files; let the agent search for the rest.

### Gaps
- No primary source on a dedicated file-selection model, embeddings, or vector index for user code.
- No details on compaction thresholds.

## 4. Editing protocol (full file → diffs/line-replace; fast-apply)

### Takeaway
History: (1) 2024 single-response `<lov-write>` with entire files; (2) "lazy" writes with `// ... keep existing code` placeholders (implies a server-side merge/apply step); (3) 2025 agent tool `lov-line-replace` — search block + explicit first/last line numbers + ellipsis for long spans, validated against the file, parallel-safe via original line numbers. No public confirmation that Lovable uses Morph/Relace.

### Cited Findings
- [MED] Old: "Use <lov-write> for creating or updating files (entire files MUST be written)"; only ONE `<lov-code>` block per response. — [older Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/e7c07887c7a2ca38591a8d216459553e557442e4/Lovable/Prompt.txt)
- [MED] lov-write (Sep 2025): "PREFER using lov-line-replace... This tool is mainly meant for creating new files or as fallback if lov-line-replace fails"; "Any unchanged code block over 5 lines MUST use '// ... keep existing code'"; comment must contain the exact string "... keep existing code" (e.g. `// ... keep existing code (user interface components)`); "be as lazy as possible with your writes"; create multiple files in parallel. — [Leaked Agent Tools.json](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Tools.json)
- [MED] lov-line-replace params: file_path, search, first_replaced_line, last_replaced_line (1-indexed), replace. "The tool will validate that search matches the content at the specified line range". For >~6 lines, search = first 2–3 lines + "..." line + last 2–3 lines; prefix/suffix must match exactly. Parallel edits to same file must use ORIGINAL line numbers ("Do not adjust line numbers based on previous edits"). Described as "the PREFERRED and PRIMARY tool". — [Leaked Agent Tools.json](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Tools.json)
- [MED] Prompt: "WRITE FILES AS FAST AS POSSIBLE. Use search and replace tools instead of rewriting entire files... If you need to change a lot in the file, rewrite it." — [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [LOW] Third-party comparison sites list Morph and Relace alongside Lovable but give no evidence Lovable is a customer. — [neuronfeed Lovable vs Morph](https://neuronfeed.com/compare/lovable-vs-morph)

### Inferences
- The "keep existing code" marker only works if something merges the sketch into the original file — either a deterministic merger or a fast-apply LLM (the Morph/Relace pattern). Which one Lovable uses is not public.
- For local Qwen: line-range + ellipsis search/replace is attractive because it is deterministic, validated, and cheap in output tokens; applying parallel edits bottom-up by original line numbers is trivial to implement. Keep full-file write as fallback for new files.

### Gaps
- No primary source on a fast-apply model, streaming-apply behavior, or edit failure rates by format.

## 5. Error handling (console/network capture, Try to Fix, fix loops, verification)

### Takeaway
The preview's console logs and network requests are exposed to the agent as tools; a free "Try to fix" button appears on preview errors; the agent iterates on logs/runtime output until resolved; 2026 Build mode adds optional browser testing, frontend tests and edge-function verification; LLM judges detect "stuck" users and a curated fix knowledge base plus agent "vent" feedback feed back into the harness.

### Cited Findings
- [HIGH] Build mode can "inspect logs, runtime output, and network activity and iterate on fixes until the issue is resolved or clarified"; verification tools (browser testing, frontend tests, edge function verification) "run only when you ask for them". — [Docs: Build mode](https://docs.lovable.dev/features/agent-mode)
- [MED] Tools lov-read-console-logs (latest logs; "logs static after code writing begins" so use once, before editing) and lov-read-network-requests (filterable); prompt says use them before examining code when debugging. — [Leaked Agent Tools.json](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Tools.json); [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [LOW] Try-to-fix button appears automatically on preview errors, scans logs, is free (reportedly 10 free fixes regenerating every 24 h). — [Lovable docs troubleshooting](https://docs.lovable.dev/tips-tricks/troubleshooting) (via search snippet; quota figure from third-party snippet, unverified)
- [HIGH] LLM judges detect stuck users ("several messages in a row asking for the same thing, complaints... or a user giving up"); "users who get stuck early on... are 4x more likely to leave". Agent has a "vent" tool posting free-text feedback to Slack; a debug agent auto-opens PRs; ~20% of vents warranted a mergeable PR, ~10 merged fixes/day, ~50% auto-PR false positives; agents became "less likely to get stuck in long loops of futile re-attempts". — [We Gave Our Agent a Vent Tool](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool)
- [HIGH] Opus 5.5 eval includes a "verification discipline" benchmark (checking changes appropriately without over-verifying). — [Opus 5.5 in Lovable](https://lovable.dev/blog/opus-5-5-now-in-lovable)

### Inferences
- A cheap auto-loop for a clone: after each agent turn, run `tsc --noEmit`/Vite build + capture preview console errors via an injected script, and feed them back as a tool result; expose "Try to fix" as a one-click prompt carrying the error payload.

### Gaps
- Not public whether Lovable runs typecheck/build automatically after every turn, or the max auto-fix iterations.

## 6. Design quality (design system, templates, Visual Edits, first message)

### Takeaway
Design quality is prompt-enforced: all styling through semantic HSL tokens in index.css + tailwind.config.ts, shadcn customized via variants, no raw colors; first message = think about vibe, set up design system first, generate real images. Visual Edits is a non-LLM path: a custom Vite plugin stamps stable IDs on JSX, the project is synced into the browser as an AST (Babel/SWC), edits are applied to the AST, regenerated, diffed, pushed to the dev server and HMR'd, with a client-side Tailwind generator for optimistic preview.

### Cited Findings
- [MED] Prompt: "CRITICAL: USE SEMANTIC TOKENS FOR COLORS, GRADIENTS, FONTS, ETC... DO NOT use direct colors like text-white, text-black, bg-white, bg-black"; "ALWAYS use HSL colors in index.css and tailwind.config.ts"; "Beautiful designs are your top priority... edit the index.css and tailwind.config.ts files as often as necessary"; "Create custom variants for shadcn components... NEVER use overrides"; watch dark/light contrast. — [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [MED] First-message block: "Since this is the first message, it is likely the user wants you to just write code"; "Take time to think about what the user wants to build... write what it evokes... then list what features you'll implement"; edit tailwind.config.ts/index.css first; "Make sure to not hold back on design"; generate images rather than placeholders; keep explanations very short. Stack: React, Vite, Tailwind, TypeScript; no Angular/Vue/Next.js; backend via Supabase. — [Leaked Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- [HIGH] Visual Edits launched Feb 12 2025 (change text, sizes, styling without prompting; custom Tailwind classes). — [Introducing Visual Edits](https://lovable.dev/blog/introducing-visual-edits)
- [HIGH] How it's built (Mar 13 2025): custom Vite plugin assigns "a unique, stable ID" to each JSX element at compile time to map DOM → "the exact JSX responsible for rendering it"; project synced into the browser as an AST ("Babel and SWC provide excellent libraries for this purpose"), AST edits replace regex hacks; flow = regenerate JSX/TSX from AST → compute diff → push to cloud dev env → HMR; client-side Tailwind generator reads the project's config to render new classes optimistically; motivation includes "AI is still (relatively) expensive". Also states >4,000 ephemeral dev-server instances on Fly.io at the time. — [How we built the Visual Edits feature](https://lovable.dev/blog/visual-edits)

### Inferences
- Clone recipe: Vite plugin (Babel) adding `data-loc="file:line:col"` or hashed IDs to JSX; iframe click handler posts the ID to parent; edit Tailwind className via Babel/recast in-browser or server-side; write file; Vite HMR does the rest.

### Gaps
- Templates: no primary-source detail on starter template contents beyond the stack (React/Vite/Tailwind/shadcn; TanStack Start for apps created after May 13 2026 per docs snippet).

## 7. Evals and quality metrics

### Takeaway
Lovable reports outcome-level metrics: build-error reduction (~90–91% with agent), stuck rate, publish rate, turns/steps and tokens per task, measured on 0-to-1, iterative-fix, and verification benchmarks at 95% confidence with ≥3 runs per task.

### Cited Findings
- [HIGH] Agent: ~90% fewer build errors (beta), 91% fewer errors on complex tasks (GA). — [Agent Mode beta](https://lovable.dev/blog/agent-mode-beta); [$100M ARR & Agent](https://lovable.dev/blog/agent)
- [HIGH] Opus 5.5 vs Opus 5: steps −26% to −48% (0-to-1), −34% to −47% (iterative fix), −42% to −57% (verification); input tokens −21% to −59%; output tokens −37% to −64% on fix/verification; three effort levels; ≥3 runs per task; 95% confidence. — [Opus 5.5 in Lovable](https://lovable.dev/blog/opus-5-5-now-in-lovable)
- [HIGH] Example model eval: "15% faster", "40% fewer turns", "2–3% higher" score vs predecessor; unit of measurement is the complete functional app; human judgment as final layer. — [The model picker is a dead end](https://lovable.dev/blog/the-model-picker-is-a-dead-end)
- [HIGH] Stuck-rate / publish-rate metrics and 4x churn for early-stuck users; automated eval gating for harness changes described as still incomplete (May 2026). — [Vent Tool](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool)
- [LOW] Third-party report of "40% efficiency gain" with Opus 4.7. — [createwith.com](https://createwith.com/tool/loveable/updates/lovable-adds-claude-opus-47-support-with-40-efficiency-gain)

### Gaps
- Eval task suites and graders are not published.

## 8. Infrastructure scale (brief)

### Takeaway
Previews run as per-project ephemeral dev servers (thousands on Fly.io in early 2025, ~1M sandboxes/day by 2026), historically Vite, being replaced by "OJ", an in-house Rust Vite-compatible dev server.

### Cited Findings
- [HIGH] >4,000 ephemeral dev-server instances on Fly.io across regions, each isolated Node.js env with a full app copy (Mar 2025). — [Visual Edits post](https://lovable.dev/blog/visual-edits)
- [HIGH] OJ (Raphael Amorim, Sep 15 2026): single Rust binary running apps "the way Vite does", reads Vite config, bridges Vite plugins, native React Fast Refresh and TanStack Start, built on Rolldown + Oxc. ~1M sandboxes/day previously each running Vite. 10K components cold start 1.2 s vs 4.9 s, memory ~115 MB vs >1.5 GB; production median preview load 17.4 s → 8.0 s, sandbox acquisition 14.5 s → 3.0 s. — [Faster previews, soon powered by OJ](https://lovable.dev/blog/faster-previews-oj)
- [HIGH] >1B tokens/min peak LLM traffic (see §1). — [Routing Billions of Tokens](https://lovable.dev/blog/routing-billions-of-tokens-per-minute)
- [HIGH] Scale: $200M ARR within 12 months, now $400M; 200k+ projects/day; 50M+ projects. — [Claude customer story](https://claude.com/customers/lovable)

### Gaps
- Sandbox orchestration details (Kubernetes posts exist on the blog index but were not fetched; covered by other researcher).
