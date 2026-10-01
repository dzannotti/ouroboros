# Backend Integrations in AI App Builders (Lovable, v0, bolt.new) + Self-Hosted Supabase Subset

Research date: 2026-10-01. Confidence tags: [H] = primary source read directly (vendor docs / source code), [M] = primary source via summarizer or single secondary source, [L] = aggregator/unverified. Primary-source facts go under "Cited Findings"; speculation goes under "Inferences".

## Lovable Cloud and the Lovable Supabase integration

### Takeaway
Lovable Cloud (launched 2025-09-29) is managed Supabase hidden behind Lovable's own UI: per-project Postgres/Auth/Storage/Edge Functions/secrets plus an AI gateway, with region lock and credit billing. The older "bring your own Supabase" integration uses OAuth into the user's Supabase org. In both modes the agent writes SQL migrations, shows them in chat for approval, and commits them to `supabase/migrations/`. Secrets are collected through a secure input and never read back by the agent. The security scan started as a check that only verified an RLS policy *exists*. It is now a Quick scan (runs before publish) plus a Deep scan (on demand).

### Cited Findings
**Cloud: product and infrastructure**
- [H] Lovable Cloud is a "built-in backend (Cloud) with database, authentication, storage, edge functions, and AI, no infrastructure setup required", built on "Supabase's open-source foundation". It is distinct from the separate Supabase integration. — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [H] Cloud is enabled for the workspace by default. When the user asks for backend features, "Lovable enables Cloud automatically or asks for your approval in the project chat first". Cloud cannot be enabled from draft mode. — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [H] Region choice is Americas, Europe or Asia Pacific. Once Cloud is enabled "the selected region is locked and cannot be changed". — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [H] Pricing is credit-based, with "monthly Cloud grants on Free, Pro, and Business plans". Users can increase the database instance size and storage in Advanced settings. — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [M] Supabase states "every project created in Lovable Cloud is powered by Supabase behind the scenes" and mentions "the thousands of projects Lovable launches every day". Features listed are managed Postgres, Auth, Storage, Edge Functions, Realtime, RLS, PITR and read replicas. The post gives no provisioning mechanism (Management API vs. other) and no cloud provider. — [Supabase blog: Lovable Cloud launch](https://supabase.com/blog/lovable-cloud-launch)
- [L] Lovable Cloud "is managed Supabase and is not visible in your own Supabase dashboard." — search snippet attributed to [Supabase blog](https://supabase.com/blog/lovable-cloud-launch). Not confirmed in the fetched text.
- [H] The Cloud UI sections are:
  - Database: "View tables, edit records, review security policies, and restore backups".
  - Users: "Manage app users and configure sign-in methods", with Google sign-in shown in the tutorial.
  - Storage: "Create buckets and manage the files".
  - Edge Functions: "Run serverless backend code and monitor how it performs".
  - Jobs: "Review scheduled background tasks and their run history", e.g. a daily 7 AM job.
  - Logs: "Debug errors and track backend activity".
  - Security checks: "Not a full audit".
  
  — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [H] Schema changes go "via SQL migrations. Updates generated types." — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [H] Migration paths: Cloud → external Supabase needs a manual export plus a schema rebuild. "migration from Supabase to Cloud is not supported". — [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)
- [M] Community migration tooling lists what a Cloud project contains: schema, data, RLS policies, functions, triggers, sequences, auth users (with original passwords/identities), storage buckets and files, edge functions "with correct per-function verify_jwt", cron jobs, and a secrets inventory. This matches standard Supabase primitives. — [community SKILL.md (jsdelivr)](https://cdn.jsdelivr.net/gh/CarolMonroe22/lovable-cloud-to-supabase-migration@main/SKILL.md), [WZ-IT guide](https://wz-it.com/en/knowledge/supabase/migrate-lovable-cloud-to-supabase/)
- [M] Edge functions are Deno-based and are for "anything that should not happen in the browser, like calling a third-party API with a secret key". — search snippet, [Lovable docs: Cloud](https://docs.lovable.dev/features/cloud)

**Supabase integration (BYO Supabase): migrations, functions, secrets, auth**
- [H] Connection flow: a workspace owner/admin OAuths into Supabase and authorizes "Lovable for the organization you pick". After that, any project editor can attach a project from that org without a Supabase account of their own. Lovable warns when several Lovable projects share one Supabase project, because they "read and write the same data, overwrite each other's secrets". — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] **Migration approval UI:** "Lovable writes the SQL, shows it to you, and asks for your approval in the project chat before running it." After approval it runs against the project, writes a "migration file in your project's code (under `supabase/migrations/`)", and regenerates TypeScript types. — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] Edge functions are generated from chat and deployed by Lovable. On failure, "Lovable reads its logs and surfaces the error in the project chat". This means the agent can read function logs. — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] **Secrets:** Lovable detects when a key is needed and "prompts you to enter the value through a secure input". Secrets are "stored in your Supabase project", "never appear in your app's code or repository, and Lovable does not read stored secret values back". — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] Lovable detects pasted API keys and steers the user to Secrets. It moves the logic into "server-side functions and secret storage" instead of the browser. — [Lovable docs: Security](https://docs.lovable.dev/features/security)
- [H] **Auth defaults (BYO Supabase):**
  - Email confirmation: docs tell users to "turn off email confirmation in your Supabase dashboard's Authentication settings so test accounts can sign in immediately". Hosted Supabase leaves confirmation on by default, so the user has to switch it off manually.
  - OAuth providers: these are enabled in the Supabase dashboard with provider credentials, then Lovable is prompted to add the UI.
  
  — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] Storage buckets are created "with user approval". Realtime uses Supabase subscriptions. — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)
- [H] BYO Supabase does not get these Cloud features: in-editor backend views, managed infrastructure, built-in payments on older React+Vite apps, auth configuration through Lovable, SAML SSO management, and signed-in browser testing. — [Lovable docs: Supabase integration](https://docs.lovable.dev/integrations/supabase)

**Security scan: what it checks now**
- [H] Quick scan runs automatically before publishing. It covers:
  - Database review: access rules, RLS gaps, overly permissive rules, password-protection settings.
  - Dependency audit: known npm vulnerabilities.
  - MCP server check: unauthenticated server exposure.
  
  — [Lovable docs: Security](https://docs.lovable.dev/features/security)
- [H] Deep scan is on demand. It adds application-level checks for:
  - access control/authorization
  - unauthenticated or abusable endpoints
  - unsafe input and injection (queries, commands, file paths, emails, AI prompts)
  - leaked secrets and guessable tokens
  - payments and billing tampering
  - auth and recovery bypass
  - sensitive data in errors and logs
  
  — [Lovable docs: Security](https://docs.lovable.dev/features/security)
- [H] Other security features:
  - "Review my app's security" works as a conversational review.
  - Auto-fix of eligible findings (RLS misconfigs, vulnerable deps), limited to "10 free fixes" shared across the workspace.
  - Optional Wiz (SCA + SAST) and Aikido (dynamic, agent-driven pentest) integrations.
  - The docs do not mention Supabase advisors.
  
  — [Lovable docs: Security](https://docs.lovable.dev/features/security)

**Lovable AI gateway**
- [H] AI calls go through edge functions that Lovable creates automatically, never from the browser. Each project gets an auto-generated `LOVABLE_API_KEY`, and remixed projects get a fresh key. — [Lovable docs: AI](https://docs.lovable.dev/integrations/ai)
- [M] Defaults per modality as of fetch:
  - Chat: "Gemini 3.8 Flash"
  - Images: GPT Image 2
  - Video: Veo 3.1 Lite
  - Embeddings: Gemini Embedding 2
  - TTS: GPT-4o Mini TTS
  - STT: "Gemini 3.5 Transcribe"
  
  Providers are OpenAI, Google and Anthropic. Rate limits are per requests/minute. The gateway returns `429` on rate limit and `402` when credits are exhausted. Model names were relayed by a summarizer, so verify them before quoting. — [Lovable docs: AI](https://docs.lovable.dev/integrations/ai)
- [M] At launch, Lovable AI was powered by Google Gemini and free until Oct 5, 2025. — [Supabase blog](https://supabase.com/blog/lovable-cloud-launch) (search snippet); [AlternativeTo news](https://alternativeto.net/news/2025/9/lovable-introduces-cloud-and-ai-to-let-users-build-full-stack-ai-enabled-apps-more-easily)

### Inferences
- The core pattern to clone has three parts:
  - Every DDL change is a SQL file shown to the user, approved in chat, then applied and committed to `supabase/migrations/`, followed by type regeneration.
  - Secrets go into a write-only store the agent can list by name but never read.
  - Function logs are exposed to the agent as a tool.
- Your stack maps onto this directly: migration files + psql/`supabase db push`-style apply, `supabase gen types`-style introspection, a secrets table or env file the agent can only write to via UI.
- Lovable's "Cloud vs BYO Supabase" split shows the value is in owning the control plane (auth settings, logs, secrets, backups in one UI). A self-hosted clone owns all of it by default.
- Lovable's BYO docs say to turn email confirmation off. Sensible defaults for a clone: confirmations off in dev/preview, on for published apps.

### Gaps
- No primary source on how Lovable provisions Cloud projects: Supabase Management API / "Supabase for Platforms", a Lovable-owned org, or dedicated vs. shared instances. Cloud provider and instance sizes are also unknown.
- No primary source on the exact tool the agent uses to read Cloud logs, or its schema.
- No detail on whether Cloud turns email confirmation on or off by default. The Cloud page does not say.

## v0 (Vercel): Marketplace integrations, env vars, schema inspection, auth

### Takeaway
v0 does not provision backends. It installs Vercel Marketplace integrations (Supabase, Neon, Upstash, Vercel Blob, AWS Aurora/DSQL/DynamoDB, Stripe, …), which create an account/resource with the provider and inject env vars into the Vercel project. The agent reads live schema, env var names and RLS policies through a `GetOrRequestIntegration` tool, and applies schema changes through the integration's remote MCP or a setup script, gated by per-integration approval. The system prompt hard-codes Supabase as the default for auth and DB, and Vercel Blob as the default for files.

### Cited Findings
- [H] Supported one-click databases are Upstash, Neon, Supabase and Vercel Blob, plus Snowflake for data apps. "Adding an integration provisions a new user account on that service and adds the necessary environment variables to your project". "For SQL-based integrations, [v0] can generate and execute SQL. This lets you create, update, and drop tables." — [v0 docs: Databases (llms.txt, lastUpdated 2026-09-30)](https://v0.app/docs/llms.txt)
- [H] You can connect from Project → Settings → Integrations, or from chat via a suggested action. Either path opens the Marketplace with click-through terms. — [v0 docs: Databases](https://v0.app/docs/llms.txt)
- [H] Env vars:
  - They are managed in Vercel, via Project → Settings → Environment Variables or the "Vars" panel.
  - The preview "will only be able to access environment variables that are available to the Development environment".
  - Client-exposed vars must be prefixed `NEXT_PUBLIC_`, and v0 "analyzes `NEXT_PUBLIC_` usage and warns users".
  - Values are encrypted in Vercel's store.
  
  — [v0 docs: External APIs / Security / Full-stack apps](https://v0.app/docs/llms.txt)
- [H] Preview runs in a Vercel Sandbox VM (Node.js with pnpm/npm/yarn/bun, framework-aware dev server for Next.js/Vite/Node). Env vars from the connected Vercel project are available to the app and to agent tools inside the sandbox. — [v0 docs: Sandbox](https://v0.app/docs/llms.txt)
- [H] Marketplace integrations can expose **remote MCP** tools to v0, e.g. "Query and manage your databases (e.g., Neon, Supabase, Upstash)". Each integration has a mode: Disabled, Ask for Approval, or Always Run. v0 scopes tools to the project's resource ID. The docs example shows v0 using a `neon_query` tool to inspect schema. — [v0 docs: MCP Integrations](https://v0.app/docs/llms.txt)
- [H] Platform API flow:
  - The agent emits an `agent-action` part `get_or_request_integration` with `data.requestedIntegrations` (e.g. `["Neon"]`) and `data.requestedMcpPresets`.
  - The client connects the resource through Vercel APIs, then resolves with `task.type: "confirmed-steps"` and `connectedIntegrationNames`.
  - Setup/migration scripts pause with a `tool-call` carrying `suggestedPermissions`, approved via `task.type: "confirmed-permissions"`.
  
  — [v0 Platform API: Handling integrations](https://v0.app/docs/api/v2/guides/handling-integrations.md)
- [M] From the leaked v0 system prompt and tools (community repo, last commit 2026-05-10; unofficial):
  - `GetOrRequestIntegration` "Checks integration status, retrieves environment variables, and gets live database schemas… RLS policies for tables if configured (Supabase, Neon, etc.). Use this instead of reading scripts from files to understand database schema".
  - Schema changes are applied "as instructed by the connected integration's skill (e.g. via the integration's MCP for Neon/Supabase, or via a setup script for Aurora)".
  - v0 "NEVER uses an ORM… unless asked".
  - Storage integrations listed: Supabase, Neon, Aurora PostgreSQL, Aurora DSQL, DynamoDB, Upstash, Vercel Blob. Payments: Stripe.
  
  — [x1xhlol/system-prompts-and-models-of-ai-tools: v0 Prompt.txt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/v0%20Prompts%20and%20Tools/Prompt.txt), [Tools.json](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/v0%20Prompts%20and%20Tools/Tools.json)
- [M] Auth policy from the same leaked prompt:
  - v0 "MUST recommend Supabase as the default choice for both authentication and the primary database, and Vercel Blob for file storage".
  - "If using Supabase integration, v0 MUST use native Supabase Auth".
  - With Neon it must build custom auth with bcrypt and HTTP-only cookie sessions.
  - It must never use mock or client-only auth.
  - It must use RLS with Supabase.
  - Upstash is only for cache, rate limiting, queues and sessions.
  
  — [v0 Prompt.txt (leaked)](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/v0%20Prompts%20and%20Tools/Prompt.txt)

### Inferences
- The `GetOrRequestIntegration` design is worth copying: one agent tool that returns connection status, env var *names*, live schema and RLS policies. For a self-hosted clone it can be backed by postgres-meta (already in the Supabase stack) or plain `information_schema`/`pg_policies` queries. This stops the agent trusting stale migration files.
- v0 puts schema changes behind a per-integration permission mode (Disabled / Ask / Always). Lovable puts them behind per-migration SQL approval. Per-migration approval is safer and simpler for a single-tenant clone.

### Gaps
- Official docs for the Supabase-specific Marketplace env var names returned 404 (`/docs/integrations/supabase`). Names like `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` come only from a third-party skill mirror ([mcpservers.org](https://mcpservers.org/agent-skills/openai/vercel-storage)) [L].
- Whether v0 runs Supabase migrations via Supabase's remote MCP `apply_migration` or via `scripts/*.sql` is unconfirmed in official docs. The leaked prompt says the per-integration "skill" decides.

## bolt.new: Bolt Cloud / Bolt Database / Supabase / Netlify

### Takeaway
Bolt Cloud bundles hosting (Netlify-powered) with a built-in "Bolt Database" (Supabase infrastructure, auto-provisioned when the app needs it). The bundle includes auth, storage, server functions, secrets, logs and a security audit. Pro/Teams users can choose their own Supabase instead. Unpublished projects' databases auto-pause after about 6 days of low use.

### Cited Findings
- [H] Bolt Cloud is "Powered by trusted platforms like Netlify and Supabase". It includes:
  - unlimited databases
  - auth: signups, logins, password reset, roles/permissions
  - file storage
  - server functions that run "on servers close to your users"
  - hosting with Share (restricted) or Publish (public)
  - domains with automatic DNS
  - Stripe payments
  - built-in analytics
  
  — [Bolt support: Bolt Cloud](https://support.bolt.new/cloud/bolt-cloud)
- [H] "Bolt creates a database automatically if your project needs one, or if you explicitly ask". Pro/Teams users can pick Supabase at setup instead of Bolt's native DB. Auth settings include email confirmation, password reset and Google sign-in. Settings sections: Authentication, User Management, File Storage, Server Functions, Secrets, Logs, Security Audit. — [Bolt support: Database](https://support.bolt.new/cloud/database)
- [H] "Bolt's Version History feature currently does not support database restores". Unpublished, low-usage projects (6+ days) may have their DB auto-paused. Published projects are never paused. — [Bolt support: Database](https://support.bolt.new/cloud/database)
- [M] Bolt Database was introduced in Sept 2025 and provisions "using Supabase infrastructure with no signup or configuration required". — search summary of [createwith.com](https://createwith.com/tool/bolt/updates/bolt-launches-unified-platform-for-building-and-scaling-apps-with-netlify-and-su) (secondary)

### Inferences
- Bolt and Lovable have converged on the same model: a hidden managed Supabase per project plus a vendor UI. Bolt's auto-pause of idle dev databases is directly relevant to a per-project container model. Scale idle project stacks to zero and resume on demand.

### Gaps
- Bolt Security Audit page (`/cloud/database/security-audit`) returned 404, so what it checks is unknown.
- Bolt's server-function runtime (likely Supabase Edge/Deno, given the Supabase base) is not stated in the docs I fetched. The same goes for its migration approval flow and whether secrets are write-only for the agent.

## Self-hosting Supabase: minimal container set, footprint, podman, multi-tenancy, supabase-js vs. Bun functions

### Takeaway
The official self-host compose (Sept 2026) has these services:

| Service | Image | Needed for your subset? |
|---|---|---|
| db | supabase/postgres 17.6 | Yes |
| api-gw | Envoy 1.39, now default; Kong is an opt-in override | Yes |
| auth | gotrue v2.196 | Yes |
| rest | postgrest v14.17 | Yes |
| storage | storage-api v1.74 | Yes |
| studio | | Optional |
| realtime | | Optional |
| imgproxy | | Optional |
| meta | postgres-meta | Optional |
| functions | edge-runtime, Deno | Optional |
| supavisor | | Optional |
| logflare/vector | | Optional |

The gateway routes `/functions/v1/*` to `functions:9000` with the prefix stripped. supabase-js invokes `${SUPABASE_URL}/functions/v1/<name>` (POST by default) with `Authorization`/`apikey` headers. So a Bun server behind the same gateway path is a drop-in replacement for the Deno edge runtime. Supabase has made several compose changes for Podman compatibility. Studio is single-project, so multi-project means one stack per project or a shared Postgres with stateless per-project service sets.

### Cited Findings
**Compose contents**
- [H] Current `docker/docker-compose.yml` (master), image tags:
  - `studio: supabase/studio:2026.09.07`
  - `api-gw: envoyproxy/envoy:v1.39.1`, with network aliases `envoy` and `kong`
  - `auth: supabase/gotrue:v2.196.0`
  - `rest: postgrest/postgrest:v14.17`
  - `realtime: supabase/realtime:v2.134.10`
  - `storage: supabase/storage-api:v1.74.0`
  - `imgproxy: darthsim/imgproxy:v3.31.4`
  - `meta: supabase/postgres-meta:v0.99.0`
  - `functions: supabase/edge-runtime:v1.76.2`
  - `db: supabase/postgres:17.6.1.136`
  - `supavisor: supabase/supavisor:2.9.12`
  
  Override files exist for caddy, nginx, kong, envoy, logs, pgbouncer, pg15/pg17, rustfs, and s3. — [supabase/supabase docker/docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml), [docker dir](https://github.com/supabase/supabase/tree/master/docker)
- [H] "Envoy is now the default API gateway, replacing Kong. Kong stays available as an opt-in override". The `kong` service was renamed `api-gw`. `docker-compose.kong.yml` is described as "superseded by Envoy". — [docker/CHANGELOG.md](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md), [PR #48153](https://github.com/supabase/supabase/pull/48153)
- [H] Envoy routing (`volumes/api/envoy/lds.template.yaml`, `cds.yaml`):

  | Path | Upstream | Rewrite |
  |---|---|---|
  | `/auth/v1/` | auth:9999 | `/` |
  | `/rest/v1/` | rest:3000 | `/` |
  | `/graphql/v1` | rest | `/rpc/graphql` |
  | `/storage/v1/` | storage:5000 | `/` |
  | `/functions/v1/` | functions:9000 | `/` |
  | `/realtime/v1` | realtime:4000 | |
  | `/pg` | meta:8080 | |
  | (none) | studio | |

  — [envoy lds.template.yaml](https://github.com/supabase/supabase/blob/master/docker/volumes/api/envoy/lds.template.yaml), [cds.yaml](https://github.com/supabase/supabase/blob/master/docker/volumes/api/envoy/cds.yaml)
- [H] Security-relevant gateway changes (2026):
  - `/rest/v1/` OpenAPI spec access via the anon/publishable key was removed.
  - Realtime `/api/tenants` and `/api/openapi` are blocked. The changelog labels this a "**security fix**".
  
  — [docker/CHANGELOG.md](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)

**Edge functions and keys**
- [H] Edge functions service details:
  - Mounts `./volumes/functions:/home/deno/functions`.
  - Runs `start --main-service /home/deno/functions/main --user-worker-request-idle-timeout 150000`.
  - Env: `SUPABASE_URL=http://api-gw:8000`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL`, `JWT_SECRET`, `VERIFY_JWT`.
  - A compose comment says "TODO: Allow configuring VERIFY_JWT per function".
  
  — [docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [H] The docs say "The main worker loads each function from disk per request, so a restart is enough to pick up new or changed function code". Functions live at `volumes/functions/<name>/index.ts`. — [Supabase docs: Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [H] Required secrets: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` (new opaque keys plus an asymmetric key pair), `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`. — [Supabase docs: Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker), [docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)

**Resources and optional components**
- [H] Hardware for the full stack: minimum 4 GB RAM, 2 CPU, 40 GB SSD; recommended 8 GB+, 4+ cores, 80 GB+. These figures are for the whole default compose, not a pruned subset. — [Supabase docs: Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [H] Optional components: "If you don't need specific services, such as Realtime, Storage, imgproxy, or Edge Runtime (`functions`), you can remove the corresponding sections." Logflare/Vector and Supavisor are also optional. — [Supabase docs: Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [H] Storage defaults to `STORAGE_BACKEND: file` with `FILE_STORAGE_BACKEND_PATH: /var/lib/storage` and `FILE_SIZE_LIMIT: 52428800` (50 MB). S3 backend and S3-protocol endpoint are optional. — [docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [H] The db container bootstraps from init SQL files: `roles.sql`, `jwt.sql`, `webhooks.sql`, `realtime.sql`, `_supabase.sql`, `logs.sql`, `pooler.sql`. Data lives in `./volumes/db/data`. Bind mounts use SELinux `:Z`/`:z` labels. — [docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)

**Podman**
- [H] Compose header: "Nested variable interpolation (${A:-${B}}) requires podman-compose >= 1.6.0". Inline comments give Podman-specific env forms because podman-compose handles JSON default interpolation differently: `GOTRUE_JWT_KEYS: ${JWT_KEYS}`, `PGRST_JWT_SECRET`, `API_JWT_JWKS: ${JWT_JWKS}`, `JWT_JWKS`, `SUPABASE_JWKS: ${JWT_JWKS}`. — [docker-compose.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [H] Podman fixes in the changelog: booleans changed to strings ([PR #40994](https://github.com/supabase/supabase/pull/40994)), healthchecks ([PR #41159](https://github.com/supabase/supabase/pull/41159)), and the Studio healthcheck ([PR #44754](https://github.com/supabase/supabase/pull/44754)). — [docker/CHANGELOG.md](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)
- [M] The self-hosting docs page itself does not mention Podman. — [Supabase docs: Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)

**CLI local dev as a reference**
- [H] Supabase CLI local-dev defaults (`apps/cli-go/pkg/config/templates/config.toml`):
  - API port 54321, DB 54322, Studio 54323, Inbucket/local SMTP 54324, analytics 54327, pooler 54329 (disabled).
  - PG `major_version = 17`.
  - `[auth.email] enable_confirmations = false`, `enable_signup = true`.
  - `[edge_runtime] policy = "per_worker"`, `deno_version = 2`.
  - Realtime, storage (with S3 protocol) and studio enabled.
  
  Each service has an `enabled` toggle, which gives a precedent for per-project service subsetting. — [supabase/cli config template](https://github.com/supabase/cli/blob/develop/apps/cli-go/pkg/config/templates/config.toml)

**Multi-project approaches**
- [M] Self-hosted Studio "mimics a single project" and does not support multiple orgs/projects. — search summary of [Supabase docs: hosting overview](https://supabase.com/docs/guides/hosting/overview) (not directly verified)
- [M] Pigsty runs "any number of stateless Supabase container clusters using Docker Compose" against external Pigsty-managed Postgres. This is the shared-Postgres-cluster, per-project-stateless-services pattern. — [Pigsty: Enterprise Self-Hosted Supabase](https://pigsty.io/docs/app/supabase/)
- [L] Schema-based isolation of multiple apps inside one Supabase instance has been described by indie devs. — [nexty.dev](https://nexty.dev/blogs/database-schema-isolation-and-migration)

**supabase-js against a Bun function server**
- [H] supabase-js sets `functionsUrl = new URL('functions/v1', baseUrl)`. `FunctionsClient.invoke(name)` fetches `${url}/${functionName}` with method default `POST` (GET/PUT/PATCH/DELETE allowed) and adds `Authorization: Bearer <user JWT>` via `fetchWithAuth`. The API key goes in the `apikey` header. Optional `x-region` header. A response header `x-relay-error` produces `FunctionsRelayError`. A non-2xx response produces `FunctionsHttpError`. — [supabase-js SupabaseClient.ts](https://github.com/supabase/supabase-js/blob/master/packages/core/supabase-js/src/SupabaseClient.ts), [functions-js FunctionsClient.ts](https://github.com/supabase/supabase-js/blob/master/packages/core/functions-js/src/FunctionsClient.ts)

### Inferences
- **Bun replacement works at the protocol level.** Point Envoy's `functions` cluster at a Bun process on :9000 that routes `/<name>` → `functions/<name>/index.ts`. Then `supabase.functions.invoke()` works unchanged.
- What the Bun server must reimplement:
  - JWT verification. edge-runtime does this with `VERIFY_JWT`, and a per-function override is still a TODO upstream. Verify against GoTrue's JWKS at `/auth/v1/.well-known/jwks.json` or `JWT_SECRET`.
  - CORS preflight.
  - Injection of the `SUPABASE_*` env vars.
  - Per-function isolation, which edge-runtime provides via per-worker isolates.
  
  Generated Deno-style code (`Deno.serve`, `Deno.env.get`, `npm:`/`jsr:` specifiers) needs a shim or a prompt rule to emit `export default { fetch }` / `Bun.serve` style. Speculative.
- **Minimal per-project subset:** db + auth + rest + storage + gateway, plus the Bun function server. Drop studio, realtime, imgproxy, meta (keep it if you want schema introspection over HTTP for the agent), supavisor, logflare, vector and edge-runtime. The 4 GB minimum is for the full stack. A pruned subset should be well under that, but I found no official number, so measure it.
- **Gateway:** Envoy is now upstream's choice, and its config is static YAML. For per-project stacks, a single shared reverse proxy (Caddy/Envoy/Traefik) routing `<project>.domain/{auth,rest,storage,functions}/v1` to per-project containers avoids N gateway containers. Upstream ships a `docker-compose.caddy.yml` override too.
- **Multi-tenancy trade-off:** one Postgres per project is simplest for isolation and RLS correctness, because roles `anon`/`authenticated`/`service_role` and schemas `auth`/`storage` are per database. A shared cluster with many databases needs one GoTrue/PostgREST/Storage per database anyway, since each is configured with one DB URL and one JWT secret. The saving is only the Postgres process memory. Given Bolt auto-pauses idle dev databases, stopping per-project pods when idle (a podman pod per project) is the pragmatic middle ground.
- **Rootless podman:** keep the `:Z` labels. Use podman-compose ≥ 1.6.0 or translate to `podman kube play` / quadlets. Use the Podman-specific JWKS env forms noted in the compose comments.

### Gaps
- I found no official or community benchmark of the RAM/CPU footprint of the pruned subset (db+auth+rest+storage+gateway).
- I found no public project that runs hundreds of per-app Supabase stacks under rootless podman. Pigsty is the closest documented "many stateless Supabase clusters" setup, and it targets Docker.
- It is unverified whether a Supabase-free Bun runtime has been used publicly as a drop-in replacement for edge-runtime.

## Security pitfalls publicly reported and vendor mitigations

### Takeaway
CVE-2025-48757 (CVSS 9.3) covers missing or insufficient RLS in Lovable-generated Supabase apps. About 170 of 1,645 sampled apps (303 endpoints) were readable or writable with the public anon key. Lovable responded with a "security scan" in Lovable 2.0 (2025-04-24). The researcher criticized it for only checking that *some* RLS policy exists. Lovable later expanded it into Quick (pre-publish) and Deep scans with auto-fix. The same failure mode keeps recurring across the ecosystem.

### Cited Findings
- [H] Timeline:

  | Date | Event |
  |---|---|
  | 2025-03-20 | Discovery on linkable.site |
  | 2025-03-21 | Broad RLS misconfiguration identified |
  | 2025-03-24 | Lovable acknowledged |
  | 2025-04-14 | Independent public disclosure by a Palantir engineer, re-notification with 45-day window |
  | 2025-04-24 | Lovable 2.0 ships "security scan" |
  | 2025-05-29 | CVE published |

  Scope: 303 vulnerable endpoints across 170 projects (~10.3% of 1,645 analyzed). Weakness class CWE-732. — [Matt Palmer: Statement on CVE-2025-48757](https://mattpalmer.io/posts/statement-on-CVE-2025-48757/)
- [H] Data exposed included emails/PII, third-party API keys (Google Maps, Gemini, eBay tokens), payment/subscription records, home addresses and personal debt amounts. — [Matt Palmer](https://mattpalmer.io/posts/statement-on-CVE-2025-48757/)
- [H] Critique: the scanner "checks for the existence of any RLS policy, not its correctness or alignment with application logic". — [Matt Palmer](https://mattpalmer.io/posts/statement-on-CVE-2025-48757/)
- [M] The NVD-style description reads "insufficient database Row-Level Security (RLS) policy in Lovable through 2025-04-15 allows remote unauthenticated attackers to read or write to arbitrary database tables of generated sites". CVSS 3 base score 9.3. — [Tenable CVE-2025-48757](https://www.tenable.com/cve/CVE-2025-48757), [SentinelOne](https://www.sentinelone.com/vulnerability-database/cve-2025-48757/)
- [H] Current Lovable mitigations: the Quick scan (DB RLS/permissive rules, npm deps, MCP exposure) runs automatically before publish, plus the Deep scan, auto-fixes, secret-paste detection and optional Wiz/Aikido integrations. — [Lovable docs: Security](https://docs.lovable.dev/features/security)
- [H] Supabase upstream hardening relevant to the anon key: self-hosted gateway configs no longer serve the PostgREST OpenAPI schema to the anon/publishable key. This reduces table enumeration, a common first step in the attacks above. — [supabase docker/CHANGELOG.md](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)
- [L] Aggregator claims, not verified at the primary source, that you should treat cautiously:
  - A Jan 2026 Wiz Research finding of a Supabase-backed app with RLS disabled exposing 1.5M API tokens and 4.75M records.
  - A Jan 2026 "SupaExplorer" scan finding 11% of 20k indie sites exposing Supabase credentials, some being `service_role` keys.
  - Tenzai's Dec 2025 test finding 69 vulnerabilities across 15 apps built by 5 coding agents.
  
  — [vibeappscanner.com (aggregator)](https://vibeappscanner.com/cve-2025-48757), [boxed-dev/vibe-coding-security](https://github.com/boxed-dev/vibe-coding-security)

### Inferences
- For the clone, the root cause is architectural: the frontend talks directly to PostgREST with the anon key, so RLS is the only authorization layer. Concrete mitigations to build in:
  - A migration linter that fails when a public-schema table has RLS disabled or has `USING (true)` policies for anon/authenticated. Supabase's `splinter` advisor lints (security_definer views, rls_disabled_in_public, etc.) are an obvious base, but that is not verified in this research.
  - Run the linter pre-apply in the migration approval UI, not only pre-publish.
  - Never expose `service_role`/secret keys to the Vite bundle. Scan the built JS for them.
  - Keep OpenAPI introspection closed to anon.
- An existence-only RLS check is known to be insufficient. The Deep-scan-style checks (per-table policy semantics, endpoint auth on functions) are where the real value is.

### Gaps
- I did not locate the original Wiz, SupaExplorer or Tenzai reports, so those numbers stay [L].
- No public writeup on Bolt- or v0-specific RLS incidents was found in this pass.
- The exact rules of Lovable's current "Database review" (whether it uses Supabase `splinter` lints) are not documented.
