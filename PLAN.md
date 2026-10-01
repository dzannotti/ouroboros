# Ouroboros — plan & progress

Self-hosted Lovable/v0 alternative against an OpenAI-compatible endpoint (models from `AI_MODELS`). Personal endpoints/keys live in the gitignored `.env`.

Research: `reports/Lovable and v0 architecture.md`, notes in `research_notes/`.

## Architecture

- `server/` — Hono on Node. Postgres (podman container `ouroboros-db`). Owns: auth (OIDC/dev user), projects, chat, agent loop, sandbox manager, preview gateway.
- `web/` — React + Vite + Tailwind v4 + shadcn + lucide. Lovable UX (home prompt → project), v0 chat (thinking, task labels, file cards).
- `template/` — starter app copied into each project: React + Vite + TS + Tailwind v4 + shadcn + lucide + react-router. Includes `ouroboros-tagger` vite plugin (JSX `data-oid` tagging + preview bridge script: console/errors/network/element select).
- `sandbox/Containerfile` — node 22 + pnpm + git + rg. One container per project, project dir bind-mounted (`:Z`, SELinux enforcing).
- Preview gateway: separate port, path `/p/<projectId>/` → container Vite (`base` from env). WS passthrough for HMR. Wakes stopped containers.
- Git is internal: one commit per agent turn, restore = new commit with old tree, "last working" = commit whose build/typecheck passed.
- Agent: own loop over OpenAI-compatible chat completions with native tool calls. Lovable-style anchored edits (`line_replace`), v0-style deterministic post-fixers (lucide icon names, missing deps), auto-fix loop capped.
- Embeddings (`qwen3-embedding-4b`) on same endpoint (reranker is misrouted in LiteLLM → returns llama.cpp webui HTML; unused until fixed): lucide icon-name fixer (v0 LLM Suspense style), file relevance for context injection.
- Backend for generated apps (later phase): Supabase subset (Postgres, GoTrue, PostgREST, Storage, gateway) + Bun functions at `/functions/v1/*`. Migrations need user approval. Security scan (RLS).

## Phases

1. [x] Scaffold monorepo, DB, server (web shell scaffolded, UI pending)
2. [x] Projects + template + git + sandbox + preview gateway (verified via API + Chrome)
3. [~] Agent loop + tools (done, verified: Flash built pomodoro app in 140s, checks passed) + streaming chat UI (pending)
4. [ ] Error capture, auto-fix, versions/restore, download zip
5. [ ] Visual edits / annotate preview
6. [ ] Design brief + design lint
7. [ ] Supabase subset backend, migrations approval, secrets, security scan
8. [ ] Plan/chat mode, ask-user questions, image attachments, URL fetch, images (stock/placeholder)

Each phase: tsc + tests + verify in Chrome via chrome-devtools MCP.

## Status log
- Run: `cd server && npx tsx src/index.ts` (8787 API, 8788 previews) + `cd web && npx vite --port 5173` (proxies /api). Tests: `npm test -w server`.
- Sandbox image: `podman build -t localhost/ouroboros-sandbox:latest -f sandbox/Containerfile .` (rebuild when template deps change).
- Image gen: ComfyUI (`COMFY_URL`), Z-Image Turbo workflow (server/src/agent/images.ts).
- Verified in Chrome: home → create → live streaming chat (thinking, tool rows, plan, check, version cards) → preview; element select + visual edit (AST) ; generate_image with thumbnails; follow-up turn.
- Chrome testing quirk: devtools `fill` doesn't trigger React onChange on composer — press a key after fill.

## Done & verified in Chrome
- Home (prompt, suggestions, screenshot-thumbnail project cards, rename/delete), project page (chat left / preview right, resizable, collapsible chat, mobile tabs)
- v0-style chat: step rows w/ connector, Thought for Ns, version cards (blue current, diff/restore menu), Worked-for footer, copy/undo/retry, suggestion chips, queue, plan "Implement" card, question cards
- Preview: route bar, device sizes, refresh/open, console (server+browser logs, auto-open on boot), "Try to fix" banner, building overlay
- Visual edits (select element → text/style panel → AST edit → commit), element chips sent to agent
- Images via ComfyUI (Z-Image Turbo) + thumbnails in chat; screenshot tool + headless runtime-error check in post-turn checks
- Versions (restore = new commit), download zip (builds standalone), code view (shiki)
- Plan mode (read-only) ; Ornith + Flash both work
- Backend (Supabase subset per project pod: postgres/gotrue/postgrest/storage + Bun functions), migrations with in-chat approval, secrets cards, security scan, Cloud tab (overview/db/users/secrets). Full-stack guestbook verified (signup, RLS insert).

Also verified: image attachments (vision), dark mode, mobile layout, stop, queue, Authentik headers + per-user isolation, remix, knowledge (instructions honored), version preview (built snapshot), clarifying questions, Try-to-fix banner, refine-element + select parent, CodeMirror hand edits (committed as versions), server functions / storage / auth via gateway, production build served over LAN.

## Known gaps / ideas
- Version bookmarks; per-file +/- stats in Code tab; edit-message "revert & resend" (currently refills composer only)
- Publish/hosting intentionally skipped (download zip instead)
- Host needs `fs.inotify.max_user_instances` raised for many projects (polling fallback exists)
- LiteLLM reranker route is misconfigured (returns llama.cpp web UI); embeddings used instead
- oxlint warnings remain in generated shadcn files and dialog reset-on-open effects (no errors)
